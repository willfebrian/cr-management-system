import { pool } from './src/server/db/pool.ts'; 
pool.query("INSERT INTO issue_people (full_name, nickname) VALUES ('Test 2', '')")
  .then(() => { console.log('success'); process.exit(0); })
  .catch(console.error);
