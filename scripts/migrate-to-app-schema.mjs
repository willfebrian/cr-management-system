import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const schemaName = process.env.PGSCHEMA || "cr_management";
const appTables = [
  "sap_systems",
  "sync_runs",
  "cr_requests",
  "cr_objects",
  "cr_object_keys"
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
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`);
  const moved = [];
  const alreadyInSchema = [];
  const missing = [];

  for (const table of appTables) {
    const publicExists = await tableExists("public", table);
    const targetExists = await tableExists(schemaName, table);

    if (targetExists) {
      alreadyInSchema.push(table);
      continue;
    }
    if (!publicExists) {
      missing.push(table);
      continue;
    }

    await pool.query(`ALTER TABLE public.${quoteIdent(table)} SET SCHEMA ${quoteIdent(schemaName)}`);
    moved.push(table);
  }

  console.log(JSON.stringify({ ok: true, schema: schemaName, moved, alreadyInSchema, missing }, null, 2));
} finally {
  await pool.end();
}

async function tableExists(schema, table) {
  const result = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
    [schema, table]
  );
  return result.rowCount > 0;
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
