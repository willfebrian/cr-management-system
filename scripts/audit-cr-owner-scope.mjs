import "dotenv/config";
import { pool } from "../src/server/db/pool.ts";

async function main() {
  const { rows: owners } = await pool.query(`
    SELECT COALESCE(owner, '[null]') AS owner, sap_system_code, COUNT(*)::int AS count
    FROM cr_requests
    WHERE COALESCE(upper(owner), '') != 'TRSTDEV'
    GROUP BY owner, sap_system_code
    ORDER BY count DESC, owner
    LIMIT 50
  `);

  const { rows: requestTotals } = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM cr_requests
    WHERE COALESCE(upper(owner), '') != 'TRSTDEV'
  `);

  const { rows: snapshotTotals } = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM cr_status_snapshots
    WHERE COALESCE(upper(owner), '') != 'TRSTDEV'
  `);

  console.table(owners);
  console.log("non_trstdev_cr_requests", requestTotals[0].count);
  console.log("non_trstdev_snapshots", snapshotTotals[0].count);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
