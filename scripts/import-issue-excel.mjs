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
const defaultFile = path.join(projectRoot, "2024 ABAP Development Log.xlsx");
const schemaName = process.env.PGSCHEMA || "cr_management";

const args = parseArgs(process.argv.slice(2));
const mode = args.mode === "commit" ? "commit" : "dry-run";
const sourceFile = args.file || defaultFile;
const sheetName = args.sheet || "INPUT";
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
  const summary = summarizeRows(rows);
  const batchId = await insertBatch({
    sourceFile,
    sheetName,
    mode,
    status: mode === "commit" && summary.errorCount > 0 ? "completed_with_errors" : "completed",
    summary,
    rows
  });

  let importedRows = 0;
  const committedRows = [];
  if (mode === "commit") {
    for (const row of rows.filter((item) => item.errors.length === 0)) {
      const result = await commitRow(row);
      importedRows += result.imported ? 1 : 0;
      committedRows.push({ rowNumber: row.rowNumber, issueKey: row.issueKey, ...result });
    }
    await pool.query(
      `UPDATE issue_import_batches SET imported_rows = $2, summary = $3::jsonb WHERE id = $1`,
      [batchId, importedRows, JSON.stringify({ ...summary, committedRows: committedRows.slice(0, 20) })]
    );
  }

  console.log(JSON.stringify({
    ok: true,
    mode,
    batchId,
    sourceFile,
    sheetName,
    ...summary,
    importedRows,
    samples: {
      warnings: rows.filter((row) => row.warnings.length).slice(0, 8).map(sampleRow),
      errors: rows.filter((row) => row.errors.length).slice(0, 8).map(sampleRow),
      cancelled: rows.filter((row) => row.isCancelled).slice(0, 8).map(sampleRow)
    }
  }, null, 2));
} finally {
  await pool.end();
}

async function readWorkbook() {
  const helper = path.join(projectRoot, "scripts", "read-issue-excel.py");
  const { stdout, stderr } = await execFileAsync(python, [
    helper,
    "--file",
    sourceFile,
    "--sheet",
    sheetName
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
  const issueKey = issueNo && subIssueNo ? `${issueNo}-${subIssueNo}` : null;

  if (!issueNo) errors.push("Missing Issue No.");
  if (!subIssueNo) errors.push("Missing Sub Issue No.");
  if (!issueName) errors.push("Missing Issue Name.");
  if (!numberOrNull(data.glpi_ticket_number)) warnings.push("Missing GLPI ticket number.");
  if (!extractTransportRequests(data.cr_no).length) warnings.push("Missing SAP transport request.");

  const status = input.is_cancelled
    ? "cancelled"
    : normalizeStatus(data.qa_status || data.dev_status);
  const cancelReason = input.is_cancelled ? textOrNull(input.cancel_reason) || "cancelled" : null;

  return {
    rowNumber: input.row_number,
    issueNo,
    subIssueNo,
    issueKey,
    status,
    isCancelled: Boolean(input.is_cancelled),
    cancelReason,
    raw: input.raw || {},
    data,
    warnings,
    errors
  };
}

async function insertBatch({ sourceFile, sheetName, mode, status, summary, rows }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query(`
      INSERT INTO issue_import_batches (
        source_file, sheet_name, import_mode, status, total_rows, valid_rows,
        imported_rows, warning_count, error_count, summary, finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9::jsonb, now())
      RETURNING id
    `, [
      sourceFile,
      sheetName,
      mode,
      status,
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

async function commitRow(row) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requester = await upsertPerson(client, row.data.requester);
    const abaper = await upsertPerson(client, row.data.abaper);
    const cancelledBy = row.isCancelled ? null : null;
    const { rows: issueRows } = await client.query(`
      INSERT INTO issue_headers (
        issue_no, sub_issue_no, issue_name, requester_person_id, requester_name_snapshot,
        problem_analysis, impact_analysis, abaper_person_id, abaper_name_snapshot,
        email_subject, email_date_received, create_issue_date, issue_status,
        cancelled_date, cancelled_reason, cancelled_by_person_id, cancelled_by_name_snapshot,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12::date, $13, $14::date, $15, $16, $17, now())
      ON CONFLICT (issue_no, sub_issue_no) DO UPDATE SET
        issue_name = EXCLUDED.issue_name,
        requester_person_id = EXCLUDED.requester_person_id,
        requester_name_snapshot = EXCLUDED.requester_name_snapshot,
        problem_analysis = EXCLUDED.problem_analysis,
        impact_analysis = EXCLUDED.impact_analysis,
        abaper_person_id = EXCLUDED.abaper_person_id,
        abaper_name_snapshot = EXCLUDED.abaper_name_snapshot,
        email_subject = EXCLUDED.email_subject,
        email_date_received = EXCLUDED.email_date_received,
        create_issue_date = EXCLUDED.create_issue_date,
        issue_status = EXCLUDED.issue_status,
        cancelled_date = EXCLUDED.cancelled_date,
        cancelled_reason = EXCLUDED.cancelled_reason,
        cancelled_by_person_id = EXCLUDED.cancelled_by_person_id,
        cancelled_by_name_snapshot = EXCLUDED.cancelled_by_name_snapshot,
        updated_at = now()
      RETURNING id
    `, [
      row.issueNo,
      row.subIssueNo,
      row.data.issue_name,
      requester?.id || null,
      textOrNull(row.data.requester),
      textOrNull(row.data.problem_analysis),
      textOrNull(row.data.impact_analysis),
      abaper?.id || null,
      textOrNull(row.data.abaper),
      textOrNull(row.data.email_subject),
      dateOrNull(row.data.email_date_received),
      dateOrNull(row.data.create_issue_date),
      row.status,
      row.isCancelled ? dateOrNull(row.data.create_issue_date) : null,
      row.cancelReason,
      cancelledBy?.id || null,
      null
    ]);
    const issueId = Number(issueRows[0].id);

    await upsertGlpiTickets(client, issueId, row.data.glpi_ticket_number);
    await upsertCrHelpdeskNumbers(client, issueId, row.data.cr_helpdesk_no);
    await upsertCrLinks(client, issueId, row.data.cr_no, row.data.cr_description);
    await upsertDevTimeline(client, issueId, row.data);
    await upsertQaTimeline(client, issueId, row.data);
    await upsertPrdTimeline(client, issueId, row.data);

    if (row.isCancelled) {
      await client.query(`
        INSERT INTO issue_status_history (
          issue_id, from_status, to_status, reason, changed_by_person_id, changed_by_name_snapshot
        )
        VALUES ($1, NULL, 'cancelled', $2, NULL, NULL)
      `, [issueId, row.cancelReason]);
    }

    await client.query("COMMIT");
    return { imported: true, issueId };
  } catch (error) {
    await client.query("ROLLBACK");
    return { imported: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    client.release();
  }
}

async function upsertPerson(client, name) {
  const normalized = textOrNull(name);
  if (!normalized) return null;
  const existing = await client.query(
    "SELECT id FROM issue_people WHERE lower(trim(full_name)) = lower(trim($1)) LIMIT 1",
    [normalized]
  );
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await client.query(
    "INSERT INTO issue_people (full_name) VALUES ($1) RETURNING id",
    [normalized]
  );
  return inserted.rows[0];
}

async function upsertGlpiTickets(client, issueId, value) {
  const ticket = numberOrNull(value);
  if (!ticket) return;
  await client.query(`
    INSERT INTO issue_glpi_tickets (issue_id, ticket_number, is_primary)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (issue_id, ticket_number) DO UPDATE SET is_primary = EXCLUDED.is_primary
  `, [issueId, ticket]);
}

async function upsertCrHelpdeskNumbers(client, issueId, value) {
  const numbers = splitTextValues(value);
  for (let index = 0; index < numbers.length; index += 1) {
    await client.query(`
      INSERT INTO issue_cr_helpdesk_numbers (issue_id, cr_helpdesk_no, is_primary)
      VALUES ($1, $2, $3)
      ON CONFLICT (issue_id, cr_helpdesk_no) DO UPDATE SET is_primary = EXCLUDED.is_primary
    `, [issueId, numbers[index], index === 0]);
  }
}

async function upsertCrLinks(client, issueId, value, description) {
  const requests = extractTransportRequests(value);
  for (let index = 0; index < requests.length; index += 1) {
    await client.query(`
      INSERT INTO issue_cr_links (issue_id, sap_system_code, trkorr, relation_type, is_primary, cr_description_snapshot)
      VALUES ($1, 'DEV', $2, 'main', $3, $4)
      ON CONFLICT (issue_id, sap_system_code, trkorr) DO UPDATE SET
        is_primary = EXCLUDED.is_primary,
        cr_description_snapshot = EXCLUDED.cr_description_snapshot
    `, [issueId, requests[index], index === 0, textOrNull(description)]);
  }
}

async function upsertDevTimeline(client, issueId, data) {
  const tester = await upsertPerson(client, data.dev_tester);
  const evaluator = await upsertPerson(client, data.dev_evaluator);
  await client.query(`
    INSERT INTO issue_dev_timeline (
      issue_id, dev_tested_date, dev_tester_person_id, dev_tester_name_snapshot,
      dev_evaluated_date, dev_evaluator_person_id, dev_evaluator_name_snapshot, updated_at
    )
    VALUES ($1, $2::date, $3, $4, $5::date, $6, $7, now())
    ON CONFLICT (issue_id) DO UPDATE SET
      dev_tested_date = EXCLUDED.dev_tested_date,
      dev_tester_person_id = EXCLUDED.dev_tester_person_id,
      dev_tester_name_snapshot = EXCLUDED.dev_tester_name_snapshot,
      dev_evaluated_date = EXCLUDED.dev_evaluated_date,
      dev_evaluator_person_id = EXCLUDED.dev_evaluator_person_id,
      dev_evaluator_name_snapshot = EXCLUDED.dev_evaluator_name_snapshot,
      updated_at = now()
  `, [
    issueId,
    dateOrNull(data.dev_tested_date),
    tester?.id || null,
    textOrNull(data.dev_tester),
    dateOrNull(data.dev_evaluated_date),
    evaluator?.id || null,
    textOrNull(data.dev_evaluator)
  ]);
}

async function upsertQaTimeline(client, issueId, data) {
  const transportedBy = await upsertPerson(client, data.transported_by_qa);
  const tester = await upsertPerson(client, data.qa_tester);
  const evaluator = await upsertPerson(client, data.qa_evaluator);
  await client.query(`
    INSERT INTO issue_qa_timeline (
      issue_id, transported_by_person_id, transported_by_name_snapshot,
      qa_tested_date, qa_tester_person_id, qa_tester_name_snapshot,
      qa_evaluated_date, qa_evaluator_person_id, qa_evaluator_name_snapshot, updated_at
    )
    VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, $8, $9, now())
    ON CONFLICT (issue_id) DO UPDATE SET
      transported_by_person_id = EXCLUDED.transported_by_person_id,
      transported_by_name_snapshot = EXCLUDED.transported_by_name_snapshot,
      qa_tested_date = EXCLUDED.qa_tested_date,
      qa_tester_person_id = EXCLUDED.qa_tester_person_id,
      qa_tester_name_snapshot = EXCLUDED.qa_tester_name_snapshot,
      qa_evaluated_date = EXCLUDED.qa_evaluated_date,
      qa_evaluator_person_id = EXCLUDED.qa_evaluator_person_id,
      qa_evaluator_name_snapshot = EXCLUDED.qa_evaluator_name_snapshot,
      updated_at = now()
  `, [
    issueId,
    transportedBy?.id || null,
    textOrNull(data.transported_by_qa),
    dateOrNull(data.qa_tested_date),
    tester?.id || null,
    textOrNull(data.qa_tester),
    dateOrNull(data.qa_evaluated_date),
    evaluator?.id || null,
    textOrNull(data.qa_evaluator)
  ]);
}

async function upsertPrdTimeline(client, issueId, data) {
  const requester = await upsertPerson(client, data.prd_requester);
  const evaluator = await upsertPerson(client, data.prd_evaluator);
  const approval = await upsertPerson(client, data.approval);
  const executor = await upsertPerson(client, data.executor);
  await client.query(`
    INSERT INTO issue_prd_timeline (
      issue_id, prd_requester_person_id, prd_requester_name_snapshot,
      prd_requested_date, prd_evaluator_person_id, prd_evaluator_name_snapshot,
      prd_evaluated_date, approval_person_id, approval_name_snapshot,
      approval_date, executor_person_id, executor_name_snapshot, updated_at
    )
    VALUES ($1, $2, $3, $4::date, $5, $6, $7::date, $8, $9, $10::date, $11, $12, now())
    ON CONFLICT (issue_id) DO UPDATE SET
      prd_requester_person_id = EXCLUDED.prd_requester_person_id,
      prd_requester_name_snapshot = EXCLUDED.prd_requester_name_snapshot,
      prd_requested_date = EXCLUDED.prd_requested_date,
      prd_evaluator_person_id = EXCLUDED.prd_evaluator_person_id,
      prd_evaluator_name_snapshot = EXCLUDED.prd_evaluator_name_snapshot,
      prd_evaluated_date = EXCLUDED.prd_evaluated_date,
      approval_person_id = EXCLUDED.approval_person_id,
      approval_name_snapshot = EXCLUDED.approval_name_snapshot,
      approval_date = EXCLUDED.approval_date,
      executor_person_id = EXCLUDED.executor_person_id,
      executor_name_snapshot = EXCLUDED.executor_name_snapshot,
      updated_at = now()
  `, [
    issueId,
    requester?.id || null,
    textOrNull(data.prd_requester),
    dateOrNull(data.prd_requested_date),
    evaluator?.id || null,
    textOrNull(data.prd_evaluator),
    dateOrNull(data.prd_evaluated_date),
    approval?.id || null,
    textOrNull(data.approval),
    dateOrNull(data.approval_date),
    executor?.id || null,
    textOrNull(data.executor)
  ]);
}

function summarizeRows(rows) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.errors.length === 0).length,
    warningCount: rows.filter((row) => row.warnings.length).length,
    errorCount: rows.filter((row) => row.errors.length).length,
    cancelledCount: rows.filter((row) => row.isCancelled).length,
    missingGlpiCount: rows.filter((row) => row.warnings.includes("Missing GLPI ticket number.")).length,
    missingCrCount: rows.filter((row) => row.warnings.includes("Missing SAP transport request.")).length,
    cancelledWithoutReasonCount: rows.filter((row) => row.isCancelled && !row.cancelReason).length
  };
}

function sampleRow(row) {
  return {
    rowNumber: row.rowNumber,
    issueKey: row.issueKey,
    issueName: row.data.issue_name,
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

function normalizeSubIssue(value) {
  const raw = textOrNull(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw.padStart(2, "0");
  return raw;
}

function normalizeStatus(value) {
  const raw = textOrNull(value);
  if (!raw || raw === "FALSE") return "open";
  return raw.toLowerCase().replaceAll(" ", "_");
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

function splitTextValues(value) {
  const text = textOrNull(value);
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item, index, array) => item && array.findIndex((candidate) => candidate.toUpperCase() === item.toUpperCase()) === index);
}

function dateOrNull(value) {
  const text = textOrNull(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function extractTransportRequests(value) {
  const text = textOrNull(value);
  if (!text) return [];
  return [...new Set((text.match(/\bTR[A-Z0-9]{6,}\b/gi) || []).map((item) => item.toUpperCase()))];
}
