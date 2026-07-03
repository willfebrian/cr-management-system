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
  console.log(JSON.stringify({ ok: true, sourceFile, ...summary }, null, 2));
} finally {
  await pool.end();
}

async function readExcelRows(file) {
  const psScript = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$rows = @()
try {
  $wb = $excel.Workbooks.Open('${escapePowerShell(file)}')
  $ws = $wb.Worksheets.Item('INPUT')
  $used = $ws.UsedRange
  $maxRow = $used.Rows.Count
  for ($r = 5; $r -le $maxRow; $r++) {
    $issueNo = $ws.Cells.Item($r, 2).Text
    $subIssue = $ws.Cells.Item($r, 3).Text
    $crHelpdesk = $ws.Cells.Item($r, 8).Text
    if (($issueNo -ne $null -and $issueNo.Trim() -ne '') -or ($crHelpdesk -ne $null -and $crHelpdesk.Trim() -ne '')) {
      $rows += [PSCustomObject]@{
        rowNumber = $r
        issueNo = $issueNo
        subIssueNo = $subIssue
        crHelpdeskNo = $crHelpdesk
      }
    }
  }
  $rows | ConvertTo-Json -Depth 4 -Compress
} finally {
  if ($wb) { $wb.Close($false) }
  $excel.Quit()
  if ($ws) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null }
  if ($wb) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`;
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript], {
    cwd: projectRoot,
    maxBuffer: 20 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function backfill(rows) {
  const client = await pool.connect();
  const warnings = [];
  let sourceRows = 0;
  let matchedIssues = 0;
  let inserted = 0;
  let skippedExisting = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const issueNo = Number(String(row.issueNo || "").replace(/[^\d]/g, ""));
      const subIssueNo = normalizeSubIssue(row.subIssueNo);
      const numbers = splitCrHelpdesk(row.crHelpdeskNo);
      if (!issueNo || !numbers.length) continue;
      sourceRows += 1;
      const issue = await client.query(
        `SELECT id FROM ${schemaName}.issue_headers WHERE issue_no = $1 AND sub_issue_no = $2 LIMIT 1`,
        [issueNo, subIssueNo]
      );
      const issueId = issue.rows[0]?.id;
      if (!issueId) {
        warnings.push({ rowNumber: row.rowNumber, issueKey: `${issueNo}-${subIssueNo}`, message: "Issue not found" });
        continue;
      }
      matchedIssues += 1;
      const hasPrimary = await client.query(
        `SELECT EXISTS (SELECT 1 FROM ${schemaName}.issue_cr_helpdesk_numbers WHERE issue_id = $1 AND is_primary) AS value`,
        [issueId]
      );
      let primaryAssigned = Boolean(hasPrimary.rows[0]?.value);
      for (const number of numbers) {
        const result = await client.query(
          `INSERT INTO ${schemaName}.issue_cr_helpdesk_numbers (issue_id, cr_helpdesk_no, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT (issue_id, cr_helpdesk_no) DO NOTHING`,
          [issueId, number, !primaryAssigned]
        );
        if (result.rowCount) {
          inserted += 1;
          primaryAssigned = true;
        } else {
          skippedExisting += 1;
        }
      }
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
    inserted,
    skippedExisting,
    warningCount: warnings.length,
    warnings: warnings.slice(0, 20)
  };
}

function splitCrHelpdesk(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item, index, array) => item && array.findIndex((candidate) => candidate.toUpperCase() === item.toUpperCase()) === index);
}

function normalizeSubIssue(value) {
  const text = String(value || "01").trim();
  if (!text) return "01";
  return /^\\d+$/.test(text) ? text.padStart(2, "0") : text;
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}
