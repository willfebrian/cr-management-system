import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const keys = ["26011-02", "25063-01", "25062-01", "25044-01", "25003-01", "25002-01"];
const schema = process.env.PGSCHEMA || process.env.PG_SCHEMA || "cr_management";
const pool = new pg.Pool(
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

const before = await pool.query(`
  SELECT
    h.id,
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    h.issue_status,
    p.prd_evaluated_date::text AS prd_evaluated_date
  FROM issue_headers h
  LEFT JOIN issue_prd_timeline p ON p.issue_id = h.id
  WHERE h.issue_no::text || '-' || h.sub_issue_no = ANY($1::text[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC
`, [keys]);

console.log("Before");
console.table(before.rows);

const updated = await pool.query(`
  UPDATE issue_prd_timeline p
  SET prd_evaluated_date = NULL
  FROM issue_headers h
  WHERE h.id = p.issue_id
    AND h.issue_status = 'cancelled'
    AND h.issue_no::text || '-' || h.sub_issue_no = ANY($1::text[])
    AND p.prd_evaluated_date IS NOT NULL
  RETURNING h.issue_no::text || '-' || h.sub_issue_no AS issue_key
`, [keys]);

const after = await pool.query(`
  SELECT
    h.id,
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    h.issue_status,
    p.prd_evaluated_date::text AS prd_evaluated_date
  FROM issue_headers h
  LEFT JOIN issue_prd_timeline p ON p.issue_id = h.id
  WHERE h.issue_no::text || '-' || h.sub_issue_no = ANY($1::text[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC
`, [keys]);

console.log("Updated rows", updated.rowCount);
console.table(updated.rows);
console.log("After");
console.table(after.rows);

await pool.end();
