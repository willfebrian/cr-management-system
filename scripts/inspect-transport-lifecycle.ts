import "dotenv/config";
import { pool } from "../src/server/db/pool.js";

const trkorr = String(process.argv[2] || "").trim().toUpperCase();
if (!trkorr) {
  console.error("Usage: tsx scripts/inspect-transport-lifecycle.ts <TRKORR>");
  process.exitCode = 1;
} else {
  try {
    const { rows } = await pool.query(`
      SELECT trkorr,
             target_system_code,
             transport_status,
             evidence_source,
             transport_step,
             imported_at,
             import_date,
             import_time,
             return_code,
             message
      FROM cr_transport_lifecycle
      WHERE source_system_code = 'DEV'
        AND trkorr = $1
      ORDER BY target_system_code
    `, [trkorr]);
    console.log(JSON.stringify({ trkorr, rows }, null, 2));
  } finally {
    await pool.end();
  }
}
