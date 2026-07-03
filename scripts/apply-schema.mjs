import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "database", "schema.sql");
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
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
  console.log(JSON.stringify({ ok: true, applied: path.relative(projectRoot, schemaPath).replaceAll("\\", "/") }, null, 2));
} finally {
  await pool.end();
}
