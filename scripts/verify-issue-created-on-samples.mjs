import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
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

try {
  const { rows } = await pool.query(`
    SELECT
      issue_no::text || '-' || sub_issue_no AS issue,
      issue_name,
      to_char(create_issue_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS create_issue_date_jkt
    FROM issue_headers
    WHERE (issue_no, sub_issue_no) IN ((26031, '01'), (26023, '01'), (25045, '02'), (24006, '02'))
    ORDER BY issue_no DESC, sub_issue_no DESC
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await pool.end();
}
