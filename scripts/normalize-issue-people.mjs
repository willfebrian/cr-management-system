import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const schemaName = process.env.PGSCHEMA || "cr_management";
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

const canonicalPeople = [
  ["Ade Listiawan", "Ade", "IT", ["Ade"]],
  ["Afifahlya Rizyomi", "Fahlya", "IT", ["Afifahlya", "Fahlya"]],
  ["Ahmad Taufiq Hidayatullah", "Taufiq", "IT", ["Taufiq"]],
  ["Achmad Wafi Makarim", "Wafi", "IT", ["Wafi", "Achmad Wafi Makarim"]],
  ["Aldi Dwi Kusuma", "Aldi", "IT", ["Aldi"]],
  ["Alfa Nur Fitriana Islami", "Alfa", "IT", ["Alfa"]],
  ["Alif Noor", "Alif", "IT", ["Alif"]],
  ["Aliyya Putri Setiyomadani", "Aliyya", "IT", ["Aliyya"]],
  ["Althof Ghulam Ishaq", "Althof", "IT", ["Althof"]],
  ["Ana Balqis", "Ana", "IT", ["Ana"]],
  ["Annisa Raudya Wibowo", "Annisa", "IT", ["Annisa", "Anbow"]],
  ["Ari Zanupratama", "Ari", "IT", ["Ari"]],
  ["Arrandi Muhamad Riesta", "Arrandi", "IT", ["Arrandi"]],
  ["Aryo Satyo", "Aryo", "IT", ["Aryo"]],
  ["Azmi Haikal", "Haikal", "IT", ["Haikal"]],
  ["Budi Purwanto", "Budi", "IT", ["Budi", "Buidi"]],
  ["Cahya Adit", "Cahya", "IT", ["Cahya"]],
  ["Debie Shabastian Rosie", "Debie", "IT", ["Debie"]],
  ["Dinda Aditama", "Dinda", "IT", ["Dinda", "Dinda A."]],
  ["Doni", "Doni", "PPIC", ["Doni", "Doni (PPIC)"]],
  ["Dwi Tyas Fitriya Ningsih", "Tyas", "IT", ["Tyas"]],
  ["Fadila Rahmawati Trisiyah", "Fadila", "IT", ["Fadila"]],
  ["Fany Parama Admaja", "Fany", "IT", ["Fany"]],
  ["Fila Sartika Sari", "Fila", "IT", ["Fila", "Fila Sartika"]],
  ["Fiqih Hidayaturrahman", "Fiqih", "IT", ["Fiqih"]],
  ["Indah Rahayuningtias", "Indah", "IT", ["Indah"]],
  ["Iqri Mannisa' Buchori", "Iqri", "IT", ["Iqri"]],
  ["Melania Syafrida", "Mela", "IT", ["Mela", "Melania"]],
  ["Muhammad Fachry Najib", "Fachry", "IT", ["Fachry"]],
  ["Nafianta Budi Purnomo", "Nafi", "IT", ["Nafi"]],
  ["Rafly Septianarta Putra", "Rafly", "IT", ["Rafly"]],
  ["Rasyid Febriansah", "Rasyid", "IT", ["Rasyid"]],
  ["Ratri Wulandari", "Ratri", "IT", ["Ratri"]],
  ["Riza Akbar Nurhadi", "Riza", "IT", ["Riza"]],
  ["Ryan Haris", "Ryan", "IT", ["Ryan"]],
  ["Rysca Chandra", "Rysca", "IT", ["Rysca"]],
  ["Siti Aisyah", "Aisyah", "IT", ["Aisyah"]],
  ["Siti Maimunah", "Munah", "IT", ["Munah"]],
  ["Slamet Mochamad Yakub", "Yakub", "IT", ["Yakub"]],
  ["Subhan Indra Prayoga", "Subhans", "IT", ["Subhans", "Subhan Indra Prayoga"]],
  ["Wahyu Setyapamungkas", "Wahyu", "IT", ["Wahyu"]],
  ["William Febrian Piktono", "William", "IT", ["William"]],
  ["Yuliana Prastiwi", "Yuli", "IT", ["Yuli"]],
  ["Yunita Ikasari Ratna Putri", "Yunita", "IT", ["Yunita"]]
];

const compositeRequesters = new Map([
  ["Aryo Satyo, Cahya Adit", ["Aryo Satyo", "Cahya Adit"]],
  ["Aryo Satyo, Dwi Tyas Fitriya Ningsih", ["Aryo Satyo", "Dwi Tyas Fitriya Ningsih"]],
  ["Alfa Nur Fitriana Islami, Slamet Mochamad Yakub", ["Alfa Nur Fitriana Islami", "Slamet Mochamad Yakub"]],
  ["Doni (PPIC) / Fany Parama Admaja", ["Doni", "Fany Parama Admaja"]]
]);

const fkTargets = [
  ["issue_headers", "requester_person_id"],
  ["issue_headers", "abaper_person_id"],
  ["issue_headers", "cancelled_by_person_id"],
  ["issue_dev_timeline", "dev_tester_person_id"],
  ["issue_dev_timeline", "dev_evaluator_person_id"],
  ["issue_qa_timeline", "transported_by_person_id"],
  ["issue_qa_timeline", "qa_tester_person_id"],
  ["issue_qa_timeline", "qa_evaluator_person_id"],
  ["issue_prd_timeline", "prd_requester_person_id"],
  ["issue_prd_timeline", "prd_evaluator_person_id"],
  ["issue_prd_timeline", "approval_person_id"],
  ["issue_prd_timeline", "executor_person_id"],
  ["issue_status_history", "changed_by_person_id"]
];

const roleSources = [
  ["requester", "requester_name_snapshot", "requester_person_id", "issue_headers", "id"],
  ["abaper", "abaper_name_snapshot", "abaper_person_id", "issue_headers", "id"],
  ["dev_tester", "dev_tester_name_snapshot", "dev_tester_person_id", "issue_dev_timeline", "issue_id"],
  ["dev_evaluator", "dev_evaluator_name_snapshot", "dev_evaluator_person_id", "issue_dev_timeline", "issue_id"],
  ["qa_transporter", "transported_by_name_snapshot", "transported_by_person_id", "issue_qa_timeline", "issue_id"],
  ["qa_tester", "qa_tester_name_snapshot", "qa_tester_person_id", "issue_qa_timeline", "issue_id"],
  ["qa_evaluator", "qa_evaluator_name_snapshot", "qa_evaluator_person_id", "issue_qa_timeline", "issue_id"],
  ["prd_requester", "prd_requester_name_snapshot", "prd_requester_person_id", "issue_prd_timeline", "issue_id"],
  ["prd_evaluator", "prd_evaluator_name_snapshot", "prd_evaluator_person_id", "issue_prd_timeline", "issue_id"],
  ["approval", "approval_name_snapshot", "approval_person_id", "issue_prd_timeline", "issue_id"],
  ["executor", "executor_name_snapshot", "executor_person_id", "issue_prd_timeline", "issue_id"]
];

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const canonicalIds = new Map();
  const aliasToCanonical = new Map();
  for (const [fullName, nickname, department, aliases] of canonicalPeople) {
    const id = await ensurePerson(fullName, nickname, department);
    canonicalIds.set(fullName, id);
    for (const value of [fullName, nickname, ...aliases]) {
      aliasToCanonical.set(normalizeName(value), id);
    }
  }

  const people = await client.query("SELECT id, full_name, nickname FROM issue_people ORDER BY id");
  for (const person of people.rows) {
    const targetId = aliasToCanonical.get(normalizeName(person.full_name || person.nickname));
    if (!targetId || Number(person.id) === targetId) continue;
    await repointPerson(Number(person.id), targetId);
  }

  await setCompositeRequesterPrimaries(canonicalIds);
  await deleteUnreferencedAliases([...canonicalIds.values()]);
  await populateParticipants(canonicalIds);

  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, ...(await collectSummary()) }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

async function ensurePerson(fullName, nickname, department) {
  const existing = await client.query("SELECT id FROM issue_people WHERE lower(trim(full_name)) = lower(trim($1)) LIMIT 1", [fullName]);
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    await client.query("UPDATE issue_people SET full_name = $2, nickname = $3, department = $4, updated_at = now() WHERE id = $1", [id, fullName, nickname, department]);
    return id;
  }
  const inserted = await client.query("INSERT INTO issue_people (full_name, nickname, department) VALUES ($1, $2, $3) RETURNING id", [fullName, nickname, department]);
  return Number(inserted.rows[0].id);
}

async function repointPerson(fromId, toId) {
  for (const [table, column] of fkTargets) {
    await client.query(`UPDATE ${table} SET ${column} = $2 WHERE ${column} = $1`, [fromId, toId]);
  }
}

async function setCompositeRequesterPrimaries(canonicalIds) {
  const issues = await client.query("SELECT id, requester_name_snapshot FROM issue_headers WHERE requester_name_snapshot IS NOT NULL");
  for (const issue of issues.rows) {
    const composite = [...compositeRequesters.entries()].find(([label]) => normalizeName(label) === normalizeName(issue.requester_name_snapshot));
    if (!composite) continue;
    await client.query("UPDATE issue_headers SET requester_person_id = $2 WHERE id = $1", [issue.id, canonicalIds.get(composite[1][0])]);
  }
}

async function deleteUnreferencedAliases(canonicalIdList) {
  const rows = await client.query("SELECT id FROM issue_people WHERE NOT (id = ANY($1::bigint[]))", [canonicalIdList]);
  for (const row of rows.rows) {
    if ((await countReferences(Number(row.id))) === 0) await client.query("DELETE FROM issue_people WHERE id = $1", [row.id]);
  }
}

async function countReferences(id) {
  let total = 0;
  for (const [table, column] of fkTargets) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`, [id]);
    total += result.rows[0].count;
  }
  return total;
}

async function populateParticipants(canonicalIds) {
  await client.query("TRUNCATE issue_participants RESTART IDENTITY");

  const issues = await client.query("SELECT id, requester_name_snapshot FROM issue_headers WHERE requester_name_snapshot IS NOT NULL");
  for (const issue of issues.rows) {
    const composite = [...compositeRequesters.entries()].find(([label]) => normalizeName(label) === normalizeName(issue.requester_name_snapshot));
    if (!composite) continue;
    for (let index = 0; index < composite[1].length; index += 1) {
      const name = composite[1][index];
      await insertParticipant(Number(issue.id), canonicalIds.get(name), name, "requester", "requester_name_snapshot", index === 0);
    }
  }

  for (const [role, snapshotColumn, personColumn, table, idColumn] of roleSources) {
    const rows = await client.query(`SELECT ${idColumn} AS issue_id, ${snapshotColumn} AS snapshot, ${personColumn} AS person_id FROM ${table} WHERE ${personColumn} IS NOT NULL`);
    for (const row of rows.rows) {
      const isCompositeRequester = role === "requester" && [...compositeRequesters.keys()].some((label) => normalizeName(label) === normalizeName(row.snapshot));
      if (isCompositeRequester) continue;
      await insertParticipant(Number(row.issue_id), Number(row.person_id), row.snapshot, role, snapshotColumn, true);
    }
  }
}

async function insertParticipant(issueId, personId, snapshot, role, sourceField, isPrimary) {
  if (!issueId || !personId || !snapshot) return;
  await client.query(`
    INSERT INTO issue_participants (issue_id, person_id, person_name_snapshot, role, source_field, is_primary)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (issue_id, role, source_field, person_name_snapshot) DO UPDATE SET
      person_id = EXCLUDED.person_id,
      is_primary = EXCLUDED.is_primary
  `, [issueId, personId, normalizeName(snapshot), role, sourceField, isPrimary]);
}

async function collectSummary() {
  const people = await client.query("SELECT COUNT(*)::int AS count FROM issue_people");
  const departments = await client.query("SELECT department, COUNT(*)::int AS count FROM issue_people GROUP BY department ORDER BY department");
  const participants = await client.query("SELECT role, COUNT(*)::int AS count FROM issue_participants GROUP BY role ORDER BY role");
  const compositeRows = await client.query("SELECT issue_no, sub_issue_no, requester_name_snapshot FROM issue_headers WHERE requester_name_snapshot LIKE '%,%' OR requester_name_snapshot LIKE '%/%' ORDER BY issue_no, sub_issue_no");
  const remainingCompositePeople = await client.query("SELECT id, full_name, nickname, department FROM issue_people WHERE full_name LIKE '%,%' OR full_name LIKE '%/%' OR full_name LIKE '%(PPIC)%' ORDER BY full_name");
  return {
    peopleCount: people.rows[0].count,
    departments: departments.rows,
    participantCounts: participants.rows,
    compositeRequesterRows: compositeRows.rows,
    remainingCompositePeople: remainingCompositePeople.rows
  };
}

function normalizeName(value) {
  return String(value || "")
    .split("")
    .map((char) => (char.charCodeAt(0) > 127 ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
