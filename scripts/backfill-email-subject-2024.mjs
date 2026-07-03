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
const schemaName = process.env.PGSCHEMA || "cr_management";
const sourceFile = process.argv[2] || path.join(projectRoot, "2024 ABAP Development Log.xlsx");
const overwrite = process.argv.includes("--overwrite");

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
  const excelRows = await readExcelRows(sourceFile);
  const summary = await backfill(excelRows);
  console.log(JSON.stringify({ ok: true, sourceFile, overwrite, ...summary }, null, 2));
} finally {
  await pool.end();
}

async function readExcelRows(file) {
  const helper = path.join(projectRoot, "scripts", "read-issue-excel.py");
  const { stdout, stderr } = await execFileAsync(process.env.ISSUE_IMPORT_PYTHON || "python", [
    helper,
    "--file",
    file,
    "--sheet",
    "INPUT"
  ], {
    cwd: projectRoot,
    maxBuffer: 50 * 1024 * 1024
  });
  if (stderr.trim() && !stderr.includes("UserWarning")) {
    throw new Error(stderr.trim());
  }
  const parsed = JSON.parse(stdout || "{}");
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

async function backfill(rows) {
  const client = await pool.connect();
  const warnings = [];
  let sourceRows = 0;
  let matchedIssues = 0;
  let updated = 0;
  let skippedExisting = 0;
  let skippedBlank = 0;

  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const data = row.normalized || {};
      const issueNo = Number(String(data.issue_no || "").replace(/[^\d]/g, ""));
      const subIssueNo = normalizeSubIssue(data.sub_issue_no);
      const emailSubject = textOrNull(data.email_subject);
      if (!issueNo || !subIssueNo) continue;
      if (!emailSubject) {
        skippedBlank += 1;
        continue;
      }
      sourceRows += 1;

      const issue = await client.query(
        `SELECT id, email_subject FROM ${schemaName}.issue_headers WHERE issue_no = $1 AND sub_issue_no = $2 LIMIT 1`,
        [issueNo, subIssueNo]
      );
      const issueRow = issue.rows[0];
      if (!issueRow) {
        warnings.push({ rowNumber: row.row_number, issueKey: `${issueNo}-${subIssueNo}`, message: "Issue not found" });
        continue;
      }
      matchedIssues += 1;

      const current = textOrNull(issueRow.email_subject);
      if (current && !overwrite) {
        skippedExisting += 1;
        continue;
      }

      await client.query(
        `UPDATE ${schemaName}.issue_headers SET email_subject = $2, updated_at = now() WHERE id = $1`,
        [issueRow.id, emailSubject]
      );
      updated += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    excelRows: rows.length,
    sourceRows,
    matchedIssues,
    updated,
    skippedExisting,
    skippedBlank,
    warningCount: warnings.length,
    warnings: warnings.slice(0, 20)
  };
}

function textOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeSubIssue(value) {
  const text = String(value || "01").trim();
  if (!text) return "01";
  return /^\d+$/.test(text) ? text.padStart(2, "0") : text;
}
