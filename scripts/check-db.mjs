import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const expectedTables = [
  "sap_systems",
  "sync_runs",
  "cr_requests",
  "cr_objects",
  "cr_object_keys",
  "cr_status_snapshots"
];
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
  const info = await pool.query(`
    SELECT
      current_database() AS database,
      current_user AS "user",
      inet_server_addr()::text AS host,
      inet_server_port() AS port,
      version() AS version
  `);

  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $2
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [expectedTables, schemaName]);

  const locations = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name = ANY($1::text[])
    ORDER BY table_schema, table_name
  `, [expectedTables]);

  const found = tables.rows.map((row) => row.table_name);
  const missing = expectedTables.filter((table) => !found.includes(table));
  const row = info.rows[0];

  console.log(JSON.stringify({
    ok: true,
    database: row.database,
    user: row.user,
    host: row.host,
    port: row.port,
    version: String(row.version).split(" on ")[0],
    schema: {
      name: schemaName,
      expected: expectedTables,
      found,
      missing,
      locations: locations.rows
    }
  }, null, 2));
} finally {
  await pool.end();
}
