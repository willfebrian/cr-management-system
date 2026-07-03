import "dotenv/config";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultFile = path.join(projectRoot, "IT Development Report 2023.xlsx");
const schemaName = process.env.PGSCHEMA || "cr_management";

const args = parseArgs(process.argv.slice(2));
const sourceFile = args.file || defaultFile;
const python = args.python || process.env.ISSUE_IMPORT_PYTHON || "python";

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, options: `-c search_path=${schemaName},public` }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        options: `-c search_path=${schemaName},public`
      }
);

try {
  const payload = await readWorkbook();
  const rows = payload.rows.map(validateRow);
  await enrichRows(rows);
  const summary = summarizeRows(rows, payload);
  const batchId = await insertStagingBatch({
    sourceFile,
    sheetName: "ALL_DEDUPED",
    summary,
    rows
  });

  console.log(JSON.stringify({
    ok: true,
    mode: "staging-only",
    batchId,
    sourceFile,
    ...summary,
    samples: {
      warnings: rows.filter((row) => row.warnings.length).slice(0, 12).map(sampleRow),
      errors: rows.filter((row) => row.errors.length).slice(0, 12).map(sampleRow),
      cancelled: rows.filter((row) => row.isCancelled).slice(0, 8).map(sampleRow),
      outstandingCr: rows.filter((row) => row.crStatuses.some((item) => item.status_group === "outstanding")).slice(0, 10).map(sampleRow)
    }
  }, null, 2));
} finally {
  await pool.end();
}

async function readWorkbook() {
  const helper = path.join(projectRoot, "scripts", "read-issue-excel-2023.py");
  const { stdout, stderr } = await execFileAsync(python, [
    helper,
    "--file",
    sourceFile
  ], {
    cwd: projectRoot,
    maxBuffer: 50 * 1024 * 1024
  });
  if (stderr.trim() && !stderr.includes("UserWarning")) {
    throw new Error(stderr.trim());
  }
  return JSON.parse(stdout);
}

function validateRow(input) {
  const data = input.normalized || {};
  const warnings = [];
  const errors = [];
  const issueNo = numberOrNull(data.issue_no);
  const subIssueNo = normalizeSubIssue(data.sub_issue_no);
  const issueName = textOrNull(data.issue_name);
  const issueKey = issueNo && subIssueNo ? `${issueNo}-${subIssueNo}` : textOrNull(data.issue_key);
  const requests = Array.isArray(data.transport_requests) ? data.transport_requests : extractTransportRequests(data.cr_no);
  const status = input.is_cancelled ? "cancelled" : normalizeStatus(data.issue_status || data.source_status);

  if (!issueNo) errors.push("Missing or invalid Issue No.");
  if (!subIssueNo) errors.push("Missing or invalid Sub Issue No.");
  if (!issueName) errors.push("Missing Issue Name.");
  if (!dateOrNull(data.create_issue_date)) warnings.push("Missing Date Start.");
  if (hasSuspiciousDate(data.create_issue_date)) warnings.push("Suspicious Date Start.");
  if (!textOrNull(data.source_status)) warnings.push("Missing source status.");
  if (!requests.length) warnings.push("Missing SAP transport request.");
  if (hasCompositeName(data.requester)) warnings.push("Composite requester; should become multiple participants.");
  if (input.is_cancelled && !textOrNull(input.cancel_reason)) warnings.push("Cancelled without explicit reason.");

  return {
    rowNumber: Number(input.staging_row_number),
    sourceSheet: input.sheet,
    sourceRow: input.source_row,
    issueNo,
    subIssueNo,
    issueKey,
    status,
    isCancelled: Boolean(input.is_cancelled),
    cancelReason: textOrNull(input.cancel_reason) || (input.is_cancelled ? "cancelled" : null),
    occurrenceCount: Number(input.occurrence_count || 1),
    transportRequests: requests,
    crStatuses: [],
    raw: {
      ...input.raw,
      source_sheet: input.sheet,
      source_row: input.source_row,
      occurrence_count: input.occurrence_count,
      excluded_formula_columns: input.excluded_formula_columns
    },
    data: {
      ...data,
      issue_no: issueNo,
      sub_issue_no: subIssueNo,
      issue_key: issueKey,
      issue_status: status,
      create_issue_date: dateOrNull(data.create_issue_date) || textOrNull(data.create_issue_date),
      transport_requests: requests
    },
    warnings,
    errors
  };
}

async function enrichRows(rows) {
  const requests = [...new Set(rows.flatMap((row) => row.transportRequests))];
  const issueKeys = rows.filter((row) => row.issueNo && row.subIssueNo).map((row) => [row.issueNo, row.subIssueNo]);
  const crByRequest = new Map();
  const existingIssues = new Set();

  if (requests.length) {
    const result = await pool.query(`
      SELECT trkorr, status_group, sap_created_at, sap_released_at
      FROM cr_requests
      WHERE sap_system_code = 'DEV'
        AND trkorr = ANY($1::text[])
    `, [requests]);
    for (const item of result.rows) {
      crByRequest.set(item.trkorr, item);
    }
  }

  if (issueKeys.length) {
    const result = await pool.query(`
      SELECT issue_no, sub_issue_no
      FROM issue_headers
      WHERE (issue_no::text || '-' || sub_issue_no) = ANY($1::text[])
    `, [issueKeys.map(([issueNo, subIssueNo]) => `${issueNo}-${subIssueNo}`)]);
    for (const item of result.rows) {
      existingIssues.add(`${item.issue_no}-${item.sub_issue_no}`);
    }
  }

  for (const row of rows) {
    row.crStatuses = row.transportRequests.map((trkorr) => crByRequest.get(trkorr) || { trkorr, missing: true });
    if (row.issueKey && existingIssues.has(row.issueKey)) {
      row.warnings.push("Issue already exists in Issue Management.");
    }
    for (const trkorr of row.transportRequests) {
      const cr = crByRequest.get(trkorr);
      if (!cr) row.warnings.push(`CR ${trkorr} not found in DEV cache.`);
      else {
        if (!cr.sap_created_at) row.warnings.push(`CR ${trkorr} missing sap_created_at.`);
        if (cr.status_group === "released" && !cr.sap_released_at) row.warnings.push(`Released CR ${trkorr} missing sap_released_at.`);
      }
    }
  }
}

async function insertStagingBatch({ sourceFile, sheetName, summary, rows }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query(`
      INSERT INTO issue_import_batches (
        source_file, sheet_name, import_mode, status, total_rows, valid_rows,
        imported_rows, warning_count, error_count, summary, finished_at
      )
      VALUES ($1, $2, 'staging-only', $3, $4, $5, 0, $6, $7, $8::jsonb, now())
      RETURNING id
    `, [
      sourceFile,
      sheetName,
      summary.errorCount > 0 ? "completed_with_errors" : "completed",
      summary.totalRows,
      summary.validRows,
      summary.warningCount,
      summary.errorCount,
      JSON.stringify(summary)
    ]);
    const batchId = Number(batchRows[0].id);

    for (const row of rows) {
      await client.query(`
        INSERT INTO issue_import_rows (
          batch_id, row_number, issue_no, sub_issue_no, issue_key, row_status,
          is_cancelled, cancel_reason, raw_data, normalized_data, warnings, errors
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::text[], $12::text[])
      `, [
        batchId,
        row.rowNumber,
        row.issueNo,
        row.subIssueNo,
        row.issueKey,
        row.errors.length ? "error" : row.warnings.length ? "warning" : "valid",
        row.isCancelled,
        row.cancelReason,
        JSON.stringify(row.raw),
        JSON.stringify(row.data),
        row.warnings,
        row.errors
      ]);
    }

    await client.query("COMMIT");
    return batchId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function summarizeRows(rows, payload) {
  const uniqueCrs = new Set(rows.flatMap((row) => row.transportRequests));
  return {
    physicalRows: payload.physical_row_count,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.errors.length === 0).length,
    warningCount: rows.filter((row) => row.warnings.length).length,
    errorCount: rows.filter((row) => row.errors.length).length,
    cancelledCount: rows.filter((row) => row.isCancelled).length,
    missingDateStartCount: rows.filter((row) => row.warnings.includes("Missing Date Start.")).length,
    suspiciousDateStartCount: rows.filter((row) => row.warnings.includes("Suspicious Date Start.")).length,
    missingCrCount: rows.filter((row) => row.warnings.includes("Missing SAP transport request.")).length,
    compositeRequesterCount: rows.filter((row) => row.warnings.includes("Composite requester; should become multiple participants.")).length,
    cancelledWithoutReasonCount: rows.filter((row) => row.warnings.includes("Cancelled without explicit reason.")).length,
    crCount: uniqueCrs.size,
    crMissingCreatedAtCount: rows.filter((row) => row.warnings.some((warning) => warning.includes("missing sap_created_at"))).length,
    releasedCrMissingReleasedAtCount: rows.filter((row) => row.warnings.some((warning) => warning.includes("missing sap_released_at"))).length,
    existingIssueCount: rows.filter((row) => row.warnings.includes("Issue already exists in Issue Management.")).length,
    statusCounts: countBy(rows, (row) => row.status),
    sourceSheets: payload.sheets
  };
}

function sampleRow(row) {
  return {
    rowNumber: row.rowNumber,
    source: `${row.sourceSheet}:${row.sourceRow}`,
    issueKey: row.issueKey,
    issueName: row.data.issue_name,
    status: row.status,
    crNo: row.data.cr_no,
    isCancelled: row.isCancelled,
    cancelReason: row.cancelReason,
    warnings: row.warnings,
    errors: row.errors
  };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function normalizeStatus(value) {
  const raw = textOrNull(value);
  if (!raw) return "open";
  const lowered = raw.toLowerCase();
  if (["finish", "finished", "ok"].includes(lowered)) return "ok";
  if (["cancelled", "canceled"].includes(lowered)) return "cancelled";
  if (["in progress", "testing"].includes(lowered)) return "open";
  return lowered.replaceAll(" ", "_");
}

function normalizeSubIssue(value) {
  const raw = textOrNull(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw.padStart(2, "0");
  return raw;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  const parsed = Number(String(value).replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function textOrNull(value) {
  if (value === null || value === undefined || value === false) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function dateOrNull(value) {
  const text = textOrNull(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function hasSuspiciousDate(value) {
  const text = dateOrNull(value);
  if (!text) return false;
  const year = Number(text.slice(0, 4));
  return year < 2018 || year > 2026;
}

function extractTransportRequests(value) {
  const text = textOrNull(value);
  if (!text) return [];
  return [...new Set((text.match(/\bTR[A-Z0-9]{6,}\b/gi) || []).map((item) => item.toUpperCase()))];
}

function hasCompositeName(value) {
  const text = textOrNull(value);
  return Boolean(text && /\/|,| dan /i.test(text));
}

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const key = getter(row) || "<blank>";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
