import { pool } from './src/server/db/pool.ts'; 
pool.query("INSERT INTO issue_people (full_name, nickname, email, department, is_active, is_approver, is_abaper, is_requester, is_tester, is_evaluator) VALUES ('Test', '', null, 'IT', true, false, false, true, false, false) RETURNING id")
  .then(res => { console.log(res.rows); process.exit(0); })
  .catch(console.error);
