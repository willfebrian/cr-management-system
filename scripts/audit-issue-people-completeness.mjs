import "dotenv/config";
import { pool } from "../src/server/db/pool.ts";

async function main() {
  const { rows } = await pool.query(`
    SELECT id, full_name, nickname, department, email
    FROM issue_people
    WHERE NULLIF(trim(COALESCE(full_name, '')), '') IS NULL
       OR NULLIF(trim(COALESCE(nickname, '')), '') IS NULL
    ORDER BY id
  `);
  console.table(rows);
  console.log("incomplete_issue_people", rows.length);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
