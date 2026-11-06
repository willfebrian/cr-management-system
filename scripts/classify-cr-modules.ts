import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { assertDatabaseSchema, pool } from "../src/server/db/pool.js";

const apply = process.argv.includes("--apply");
const migration = fs.readFileSync(fileURLToPath(new URL("../database/migrations/20261022_cr_transport_modules.sql", import.meta.url)), "utf8");

try {
  if (apply) throw new Error("Automatic CR module classification is suspended pending new rules. Existing module values are preserved.");
  await assertDatabaseSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(migration);
    const preview = await client.query(`
      SELECT cr.sap_system_code, module.code AS module, count(*)::int AS requests,
             count(*) FILTER (WHERE cr.module_id IS DISTINCT FROM module.id)::int AS changes,
             min(cr.description) AS example
      FROM cr_requests cr
      LEFT JOIN module_master module
        ON module.module_group = 'SAP' AND module.code = cr_module_code(cr.description)
      WHERE cr.parent_request IS NULL
      GROUP BY cr.sap_system_code, module.code
      ORDER BY cr.sap_system_code, module.code NULLS LAST
    `);
    let updated = 0;
    if (apply) {
      const result = await client.query(`
        WITH classified AS (
          SELECT cr.sap_system_code, cr.trkorr, module.id AS module_id
          FROM cr_requests cr
          LEFT JOIN module_master module
            ON module.module_group = 'SAP' AND module.code = cr_module_code(cr.description)
          WHERE cr.parent_request IS NULL
        )
        UPDATE cr_requests cr SET module_id = classified.module_id
        FROM classified
        WHERE cr.sap_system_code = classified.sap_system_code AND cr.trkorr = classified.trkorr
          AND cr.module_id IS DISTINCT FROM classified.module_id
      `);
      updated = result.rowCount || 0;
      await client.query(`INSERT INTO activity_logs (activity_type, action, username, description, metadata)
        VALUES ('sync', 'classify_cr_modules', 'SYSTEM', 'Classified existing CR transports by description prefix.', $1)`,
        [JSON.stringify({ updated, summary: preview.rows })]);
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(JSON.stringify({ ok: true, applied: apply, updated, summary: preview.rows }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
