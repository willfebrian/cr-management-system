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
  const [runs, requests, status, objects, keys, snapshots] = await Promise.all([
    pool.query("SELECT id, sap_system_code, scope_owner, status, request_count, started_at, finished_at FROM sync_runs ORDER BY id DESC LIMIT 5"),
    pool.query("SELECT COUNT(*)::int AS count FROM cr_requests"),
    pool.query("SELECT status_group, COUNT(*)::int AS count FROM cr_requests GROUP BY status_group ORDER BY status_group"),
    pool.query("SELECT COUNT(*)::int AS count FROM cr_objects"),
    pool.query("SELECT COUNT(*)::int AS count FROM cr_object_keys"),
    pool.query("SELECT COUNT(*)::int AS count FROM cr_status_snapshots")
  ]);

  console.log(JSON.stringify({
    ok: true,
    schema: schemaName,
    latestRuns: runs.rows,
    counts: {
      requests: requests.rows[0].count,
      objects: objects.rows[0].count,
      objectKeys: keys.rows[0].count,
      statusSnapshots: snapshots.rows[0].count,
      byStatus: status.rows
    }
  }, null, 2));
} finally {
  await pool.end();
}
