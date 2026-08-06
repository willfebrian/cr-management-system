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

try {
  console.log("--- Issue Headers with Annisa in requester_name_snapshot ---");
  const headersReq = await pool.query(`
    SELECT issue_no, sub_issue_no, issue_name, requester_name_snapshot, abaper_name_snapshot
    FROM issue_headers
    WHERE upper(requester_name_snapshot) LIKE '%ANNISA%'
  `);
  console.table(headersReq.rows);

  console.log("--- Issue Participants for Annisa ---");
  const part = await pool.query(`
    SELECT p.issue_id, p.role, p.person_name_snapshot, people.full_name, people.nickname, h.issue_no, h.sub_issue_no, h.issue_name, h.requester_name_snapshot, h.abaper_name_snapshot
    FROM issue_participants p
    LEFT JOIN issue_people people ON people.id = p.person_id
    JOIN issue_headers h ON h.id = p.issue_id
    WHERE upper(coalesce(people.full_name, '')) LIKE '%ANNISA%'
       OR upper(coalesce(people.nickname, '')) LIKE '%ANNISA%'
       OR upper(coalesce(p.person_name_snapshot, '')) LIKE '%ANNISA%'
  `);
  console.table(part.rows);
} finally {
  await pool.end();
}
