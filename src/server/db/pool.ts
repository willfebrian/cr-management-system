import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

if (!/^[a-z_][a-z0-9_]{0,62}$/.test(config.pg.schema) || config.pg.schema === "public" || config.pg.schema.startsWith("pg_")) {
  throw new Error("PGSCHEMA must be a valid, dedicated application schema name.");
}

export const pool = new Pool(
  config.databaseUrl
    ? { connectionString: config.databaseUrl, options: `-c search_path=${config.pg.schema}` }
    : {
        host: config.pg.host,
        port: config.pg.port,
        database: config.pg.database,
        user: config.pg.user,
        password: config.pg.password,
        options: `-c search_path=${config.pg.schema}`
      }
);

export async function assertDatabaseConfigured() {
  if (!config.databaseUrl && (!config.pg.user || !config.pg.password)) {
    throw new Error("PostgreSQL credential is not configured yet. Fill DATABASE_URL or PGUSER/PGPASSWORD in .env.");
  }
}

export async function assertDatabaseSchema() {
  await assertDatabaseConfigured();
  const result = await pool.query(
    "SELECT current_schema() AS schema, has_schema_privilege(current_user, $1, 'USAGE') AS usable",
    [config.pg.schema]
  );
  if (result.rows[0]?.schema !== config.pg.schema || !result.rows[0]?.usable) {
    throw new Error(`Database schema "${config.pg.schema}" does not exist or is not accessible. Check PGSCHEMA.`);
  }
}

export function databaseConnectionMessage(error: unknown, host = config.pg.host, port = config.pg.port) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  if (["EACCES", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) {
    return `Database is unreachable at ${host}:${port}. Check the network, VPN, firewall, and PostgreSQL service.`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function configuredDatabaseTarget() {
  if (config.databaseUrl) {
    try {
      const url = new URL(config.databaseUrl);
      return { host: url.hostname, port: Number(url.port || 5432) };
    } catch {
      return { host: config.pg.host, port: config.pg.port };
    }
  }
  return { host: config.pg.host, port: config.pg.port };
}

export async function checkDatabaseHealth() {
  const target = configuredDatabaseTarget();
  try {
    await assertDatabaseSchema();
    await pool.query("SELECT 1");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: databaseConnectionMessage(error, target.host, target.port) };
  }
}
