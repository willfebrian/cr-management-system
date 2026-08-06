import { pool, assertDatabaseConfigured } from '../src/server/db/pool.js';

async function main() {
  await assertDatabaseConfigured();
  const result = await pool.query("DELETE FROM activity_logs WHERE username = 'TEST_ADMIN'");
  console.log(`Successfully deleted ${result.rowCount} log entries for username 'TEST_ADMIN'.`);
  await pool.end();
}

main().catch(console.error);
