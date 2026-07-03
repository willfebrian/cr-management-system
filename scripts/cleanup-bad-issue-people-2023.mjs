import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const mode = process.argv.includes("--commit") ? "commit" : "dry-run";
const schemaName = process.env.PGSCHEMA || "cr_management";
const badExactNames = [
  "Akbar",
  "Ulya",
  "Alifi",
  "Afir",
  "Stefanus",
  "Fathir",
  "Fahmi",
  "Anbow"
];

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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(`
      SELECT p.id, p.full_name,
        COUNT(DISTINCT h1.id)::int AS requester_refs,
        COUNT(DISTINCT h2.id)::int AS abaper_refs,
        COUNT(DISTINCT part.id)::int AS participant_refs
      FROM issue_people p
      LEFT JOIN issue_headers h1 ON h1.requester_person_id = p.id
      LEFT JOIN issue_headers h2 ON h2.abaper_person_id = p.id
      LEFT JOIN issue_participants part ON part.person_id = p.id
      WHERE p.full_name ILIKE '%ABAPer%'
         OR p.full_name = ANY($1::text[])
      GROUP BY p.id, p.full_name
      ORDER BY p.id
    `, [badExactNames]);

    const deleted = await client.query(`
      DELETE FROM issue_people p
      WHERE (p.full_name ILIKE '%ABAPer%' OR p.full_name = ANY($1::text[]))
        AND NOT EXISTS (SELECT 1 FROM issue_headers h WHERE h.requester_person_id = p.id OR h.abaper_person_id = p.id OR h.cancelled_by_person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM issue_dev_timeline d WHERE d.dev_tester_person_id = p.id OR d.dev_evaluator_person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM issue_qa_timeline q WHERE q.transported_by_person_id = p.id OR q.qa_tester_person_id = p.id OR q.qa_evaluator_person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM issue_prd_timeline pr WHERE pr.prd_requester_person_id = p.id OR pr.prd_evaluator_person_id = p.id OR pr.approval_person_id = p.id OR pr.executor_person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM issue_participants part WHERE part.person_id = p.id)
      RETURNING id, full_name
    `, [badExactNames]);

    if (mode === "commit") await client.query("COMMIT");
    else await client.query("ROLLBACK");

    console.log(JSON.stringify({ mode, candidates: before.rows, deleted: deleted.rows }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
