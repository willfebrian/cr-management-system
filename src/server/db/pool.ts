import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool(
  config.databaseUrl
    ? { connectionString: config.databaseUrl, options: `-c search_path=${config.pg.schema},public` }
    : {
        host: config.pg.host,
        port: config.pg.port,
        database: config.pg.database,
        user: config.pg.user,
        password: config.pg.password,
        options: `-c search_path=${config.pg.schema},public`
      }
);

export async function assertDatabaseConfigured() {
  if (!config.databaseUrl && (!config.pg.user || !config.pg.password)) {
    throw new Error("PostgreSQL credential is not configured yet. Fill DATABASE_URL or PGUSER/PGPASSWORD in .env.");
  }
}
