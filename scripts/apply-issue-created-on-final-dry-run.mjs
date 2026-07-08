import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

function latestDryRunFile() {
  const outputDir = path.join(process.cwd(), "outputs");
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);
  const files = fs.readdirSync(outputDir)
    .filter((name) => /^issue-created-on-final-dry-run.*\.xlsx$/i.test(name))
    .map((name) => {
      const fullPath = path.join(outputDir, name);
      return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error("No final dry-run workbook found in outputs.");
  return files[0].fullPath;
}

function parseIssueKey(issueKey) {
  const match = String(issueKey || "").trim().match(/^(\d+)-(.+)$/);
  if (!match) throw new Error(`Invalid issue key "${issueKey}". Expected format 26032-01.`);
  return { issueNo: Number(match[1]), subIssueNo: match[2] };
}

function normalizeTimestamp(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid timestamp "${value}". Expected YYYY-MM-DD HH:mm:ss.`);
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}+07`;
}

const workbook = latestDryRunFile();
const readerScript = path.join(process.cwd(), "scripts", "read-issue-created-on-final-dry-run.ps1");
const json = execFileSync(
  "powershell",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", readerScript, "-Workbook", workbook],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
);
const rows = JSON.parse(json);

if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error("Dry-run workbook did not contain any rows to apply.");
}

const seen = new Set();
for (const row of rows) {
  const issueKey = String(row.issue || "").trim();
  if (seen.has(issueKey)) throw new Error(`Duplicate issue in dry-run workbook: ${issueKey}`);
  seen.add(issueKey);
  parseIssueKey(issueKey);
  normalizeTimestamp(row.finalToBeCreateOn);
}

const schema = process.env.PGSCHEMA || "cr_management";
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        options: `-c search_path=${schema},public`
      }
);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL TIME ZONE 'Asia/Jakarta'");

  let updated = 0;
  const missing = [];
  const changedSamples = [];

  for (const row of rows) {
    const { issueNo, subIssueNo } = parseIssueKey(row.issue);
    const finalTimestamp = normalizeTimestamp(row.finalToBeCreateOn);
    const result = await client.query(`
      UPDATE issue_headers
      SET create_issue_date = $3::timestamptz,
          updated_at = now()
      WHERE issue_no = $1
        AND sub_issue_no = $2
      RETURNING
        issue_no::text || '-' || sub_issue_no AS issue,
        issue_name,
        to_char(create_issue_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS create_issue_date_jkt
    `, [issueNo, subIssueNo, finalTimestamp]);

    if (result.rowCount === 0) {
      missing.push(row.issue);
      continue;
    }
    updated += 1;
    if (changedSamples.length < 10) {
      changedSamples.push({
        issue: result.rows[0].issue,
        issueName: result.rows[0].issue_name,
        asIs: row.asIsCreateOn,
        final: result.rows[0].create_issue_date_jkt
      });
    }
  }

  if (missing.length) {
    throw new Error(`Some issues were not found, rollback triggered: ${missing.slice(0, 20).join(", ")}`);
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({
    ok: true,
    workbook,
    requestedRows: rows.length,
    updatedRows: updated,
    samples: changedSamples
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
