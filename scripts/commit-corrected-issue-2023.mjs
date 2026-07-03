import "dotenv/config";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const schemaName = process.env.PGSCHEMA || "cr_management";
const args = parseArgs(process.argv.slice(2));
const sourceFile = args.source || path.join(projectRoot, "IT Development Report 2023.xlsx");
const warningFile = args.warning || path.join(projectRoot, "IT Development Report 2023 - Warning List.xlsx");
const python = args.python || process.env.ISSUE_IMPORT_PYTHON || "python";
const mode = args.mode === "dry-run" ? "dry-run" : "commit";
const LEGACY_PERSON_ALIASES = new Map([
  ["akbar", "Alif Akbar Tejamukti"],
  ["ulya", "Ulya Nuzulir"],
  ["afir", "Abdillah Ibnu Firdaus"],
  ["stefanus", "Stefanus Eka Prastya"],
  ["fathir", "Fathir Qisthi"],
  ["fahmi", "Fahmi Hasan"],
  ["alifi", "Mualifi"],
  ["anbow", "Annisa Raudya Wibowo"]
]);
const CANONICAL_NICKNAMES = new Map([
  ["Alif Akbar Tejamukti", "Akbar"],
  ["Ulya Nuzulir", "Ulya"],
  ["Abdillah Ibnu Firdaus", "Afir"],
  ["Stefanus Eka Prastya", "Stefanus"],
  ["Fathir Qisthi", "Fathir"],
  ["Fahmi Hasan", "Fahmi"]
]);

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
  const payload = await readCorrectedRows();
  const auditPath = path.join(projectRoot, "logs", "issue-2023-corrected-commit-payload.json");
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(payload, null, 2));

  const summary = await commitRows(payload.rows);
  console.log(JSON.stringify({ ok: true, mode, auditPath, ...summary }, null, 2));
} finally {
  await pool.end();
}

async function readCorrectedRows() {
  const helper = path.join(projectRoot, "scripts", "read-corrected-issue-2023.py");
  const reader = path.join(projectRoot, "scripts", "read-issue-excel-2023.py");
  const { stdout, stderr } = await execFileAsync(python, [
    helper,
    "--source-file",
    sourceFile,
    "--warning-file",
    warningFile,
    "--reader",
    reader
  ], {
    cwd: projectRoot,
    maxBuffer: 80 * 1024 * 1024
  });
  if (stderr.trim() && !stderr.includes("UserWarning")) {
    throw new Error(stderr.trim());
  }
  return JSON.parse(stdout);
}

async function commitRows(rows) {
  const client = await pool.connect();
  const stats = {
    rows: rows.length,
    insertedOrUpdatedIssues: 0,
    crLinks: 0,
    participants: 0,
    statusHistory: 0,
    crCreatedBackfilled: 0,
    crReleasedBackfilled: 0,
    legacyIssueKeysConverted: 0,
    cancelledIssues: 0
  };

  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const result = await upsertIssue(client, row);
      stats.insertedOrUpdatedIssues += 1;
      stats.crLinks += result.crLinks;
      stats.participants += result.participants;
      stats.statusHistory += result.statusHistory;
      stats.crCreatedBackfilled += result.crCreatedBackfilled;
      stats.crReleasedBackfilled += result.crReleasedBackfilled;
      stats.legacyIssueKeysConverted += result.legacyIssueKeysConverted;
      stats.cancelledIssues += result.cancelled ? 1 : 0;
    }
    if (mode === "dry-run") {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    return stats;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertIssue(client, row) {
  const data = row.data;
  const result = {
    crLinks: 0,
    participants: 0,
    statusHistory: 0,
    crCreatedBackfilled: 0,
    crReleasedBackfilled: 0,
    legacyIssueKeysConverted: data.original_issue_key !== data.issue_key ? 1 : 0,
    cancelled: row.is_cancelled
  };

  await applyE070Fallbacks(client, data);
  const requesterNames = data.requester_names?.length ? data.requester_names : splitPeople(data.requester);
  const abaperNames = data.abaper_names?.length ? data.abaper_names : [];
  const canonicalRequesters = requesterNames.map(canonicalPersonName).filter(Boolean);
  const canonicalAbapers = abaperNames.map(canonicalPersonName).filter(Boolean);
  const requesterSnapshot = canonicalRequesters.join("; ") || canonicalPersonName(data.requester);
  const abaperSnapshot = canonicalAbapers.join("; ") || null;
  const requester = canonicalRequesters[0] ? await upsertPerson(client, canonicalRequesters[0]) : null;
  const abaper = canonicalAbapers[0] ? await upsertPerson(client, canonicalAbapers[0]) : null;
  const createIssueDate = data.create_issue_date || (data.e070_fallback_requested ? await getFirstCrChangedDate(client, data.transport_requests) : null);

  const issueRows = await client.query(`
    INSERT INTO issue_headers (
      issue_no, sub_issue_no, issue_name, requester_person_id, requester_name_snapshot,
      problem_analysis, impact_analysis, abaper_person_id, abaper_name_snapshot,
      email_subject, email_date_received, create_issue_date, issue_status,
      cancelled_date, cancelled_reason, cancelled_by_person_id, cancelled_by_name_snapshot,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7, NULL, NULL, $8::date, $9,
            $10::date, $11, NULL, NULL, now())
    ON CONFLICT (issue_no, sub_issue_no) DO UPDATE SET
      issue_name = EXCLUDED.issue_name,
      requester_person_id = EXCLUDED.requester_person_id,
      requester_name_snapshot = EXCLUDED.requester_name_snapshot,
      abaper_person_id = EXCLUDED.abaper_person_id,
      abaper_name_snapshot = EXCLUDED.abaper_name_snapshot,
      create_issue_date = EXCLUDED.create_issue_date,
      issue_status = EXCLUDED.issue_status,
      cancelled_date = EXCLUDED.cancelled_date,
      cancelled_reason = EXCLUDED.cancelled_reason,
      updated_at = now()
    RETURNING id
  `, [
    data.issue_no,
    data.sub_issue_no,
    data.issue_name,
    requester?.id || null,
    requesterSnapshot,
    abaper?.id || null,
    abaperSnapshot,
    createIssueDate,
    data.issue_status,
    row.is_cancelled ? createIssueDate : null,
    row.cancel_reason || null
  ]);
  const issueId = Number(issueRows.rows[0].id);

  await client.query("DELETE FROM issue_participants WHERE issue_id = $1", [issueId]);
  result.participants += await insertParticipants(client, issueId, "requester", "requester", canonicalRequesters);
  result.participants += await insertParticipants(client, issueId, "abaper", "abaper", canonicalAbapers);

  result.crLinks += await upsertCrLinks(client, issueId, data.transport_requests, data.cr_description);
  result.crCreatedBackfilled += await backfillCrCreated(client, data, row.corrections || {});
  result.crReleasedBackfilled += await backfillCrReleased(client, data, row.corrections || {});

  if (row.is_cancelled) {
    await client.query(`
      INSERT INTO issue_status_history (issue_id, from_status, to_status, reason, changed_by_person_id, changed_by_name_snapshot)
      SELECT $1, NULL, 'cancelled', $2, NULL, NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM issue_status_history WHERE issue_id = $1 AND to_status = 'cancelled'
      )
    `, [issueId, row.cancel_reason || "cancelled"]);
    result.statusHistory += 1;
  }

  return result;
}

async function applyE070Fallbacks(client, data) {
  if (!data.e070_fallback_requested || data.create_issue_date) return;
  data.create_issue_date = await getFirstCrChangedDate(client, data.transport_requests);
  if (data.create_issue_date) data.create_issue_date_source = "sap_e070_fallback";
}

async function getFirstCrChangedDate(client, requests) {
  if (!requests?.length) return null;
  const result = await client.query(`
    SELECT changed_date::text AS changed_date
    FROM cr_requests
    WHERE sap_system_code = 'DEV'
      AND trkorr = ANY($1::text[])
      AND changed_date IS NOT NULL
    ORDER BY changed_date, changed_time
    LIMIT 1
  `, [requests]);
  return result.rows[0]?.changed_date || null;
}

async function backfillCrCreated(client, data, corrections) {
  if (!data.create_issue_date || !data.transport_requests?.length) return 0;
  let updated = 0;
  const approved = Object.values(corrections || {}).some((correction) =>
    correction === "Samakan dengan kolom Date Start di Excel" ||
    correction.startsWith("Koreksi date start:") ||
    correction === "Ikuti table SAP sekarang (E070)"
  );
  if (!approved) return 0;

  for (const trkorr of data.transport_requests) {
    const result = await client.query(`
      UPDATE cr_requests
      SET sap_created_at = (($1::date + time '08:00:00') AT TIME ZONE 'Asia/Jakarta'),
          sap_created_source = $2,
          updated_at = now()
      WHERE sap_system_code = 'DEV'
        AND trkorr = $3
        AND sap_created_at IS NULL
    `, [data.create_issue_date, data.create_issue_date_source || "excel_2023_correction", trkorr]);
    updated += result.rowCount;
  }
  return updated;
}

async function backfillCrReleased(client, data, corrections) {
  let updated = 0;
  const releaseFallbackRequested = Object.entries(corrections || {}).some(([warning, correction]) =>
    warning.includes("missing sap_released_at") && correction === "Ikuti table SAP sekarang (E070)"
  );
  if (!releaseFallbackRequested || !data.transport_requests?.length) return 0;

  for (const trkorr of data.transport_requests) {
    const result = await client.query(`
      UPDATE cr_requests
      SET sap_released_at = CASE
            WHEN changed_date IS NOT NULL AND changed_time IS NOT NULL
            THEN ((changed_date + changed_time) AT TIME ZONE 'Asia/Jakarta')
            WHEN changed_date IS NOT NULL
            THEN ((changed_date + time '08:00:00') AT TIME ZONE 'Asia/Jakarta')
            ELSE sap_released_at
          END,
          sap_released_source = 'sap_e070_fallback',
          updated_at = now()
      WHERE sap_system_code = 'DEV'
        AND trkorr = $1
        AND sap_released_at IS NULL
        AND changed_date IS NOT NULL
    `, [trkorr]);
    updated += result.rowCount;
  }
  return updated;
}

async function upsertCrLinks(client, issueId, requests, description) {
  let count = 0;
  for (let index = 0; index < (requests || []).length; index += 1) {
    await client.query(`
      INSERT INTO issue_cr_links (issue_id, sap_system_code, trkorr, relation_type, is_primary, cr_description_snapshot)
      VALUES ($1, 'DEV', $2, 'main', $3, $4)
      ON CONFLICT (issue_id, sap_system_code, trkorr) DO UPDATE SET
        is_primary = EXCLUDED.is_primary,
        cr_description_snapshot = EXCLUDED.cr_description_snapshot
    `, [issueId, requests[index], index === 0, textOrNull(description)]);
    count += 1;
  }
  return count;
}

async function insertParticipants(client, issueId, role, sourceField, names) {
  let count = 0;
  for (let index = 0; index < (names || []).length; index += 1) {
    const name = textOrNull(names[index]);
    if (!name) continue;
    const person = await upsertPerson(client, name);
    await client.query(`
      INSERT INTO issue_participants (issue_id, person_id, person_name_snapshot, role, source_field, is_primary)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (issue_id, role, source_field, person_name_snapshot) DO UPDATE SET
        person_id = EXCLUDED.person_id,
        is_primary = EXCLUDED.is_primary
    `, [issueId, person?.id || null, name, role, sourceField, index === 0]);
    count += 1;
  }
  return count;
}

async function upsertPerson(client, name) {
  const normalized = textOrNull(name);
  if (!normalized) return null;
  const existing = await client.query(
    `SELECT id
     FROM issue_people
     WHERE lower(trim(full_name)) = lower(trim($1))
        OR lower(trim(nickname)) = lower(trim($1))
     LIMIT 1`,
    [normalized]
  );
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await client.query(
    "INSERT INTO issue_people (full_name, nickname, department) VALUES ($1, $2, 'IT') RETURNING id",
    [normalized, CANONICAL_NICKNAMES.get(normalized) || null]
  );
  return inserted.rows[0];
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

function splitPeople(value) {
  const text = textOrNull(value);
  if (!text) return [];
  return text.split(/\s*\/\s*|\s*,\s*|\s+dan\s+/i).map((item) => item.trim()).filter(Boolean);
}

function canonicalPersonName(value) {
  const normalized = textOrNull(value);
  if (!normalized) return null;
  return LEGACY_PERSON_ALIASES.get(normalized.toLowerCase()) || normalized;
}

function textOrNull(value) {
  if (value === null || value === undefined || value === false) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text : null;
}
