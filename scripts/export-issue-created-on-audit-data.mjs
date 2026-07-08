import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

const outputPath = process.argv[2] || path.join(process.cwd(), "outputs", "issue-created-on-db.json");
const schema = process.env.PGSCHEMA || "cr_management";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST,
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT || 5432),
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE,
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER,
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD
});

try {
  await pool.query(`SET search_path TO ${schema}, public`);
  const { rows } = await pool.query(`
    SELECT
      h.id,
      h.issue_no,
      h.sub_issue_no,
      h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
      h.issue_name,
      h.issue_status,
      to_char(h.create_issue_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS create_issue_date_jkt,
      to_char(h.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS row_created_at_jkt,
      primary_glpi.ticket_number AS primary_glpi_ticket,
      COALESCE(all_glpi.ticket_numbers, '') AS all_glpi_tickets
    FROM issue_headers h
    LEFT JOIN LATERAL (
      SELECT ticket_number
      FROM issue_glpi_tickets
      WHERE issue_id = h.id
      ORDER BY is_primary DESC, ticket_number
      LIMIT 1
    ) primary_glpi ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(ticket_number::text, ', ' ORDER BY is_primary DESC, ticket_number) AS ticket_numbers
      FROM issue_glpi_tickets
      WHERE issue_id = h.id
    ) all_glpi ON true
    ORDER BY h.issue_no DESC, h.sub_issue_no DESC
  `);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Exported ${rows.length} issue rows to ${outputPath}`);
} finally {
  await pool.end();
}
