import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
test('isolated PostgreSQL schema verifies migration, Issue reads, atomic saves, and concurrent deactivation',{skip:!process.env.MODULE_TEST_ENV_PATH},async()=>{
 dotenv.config({path:process.env.MODULE_TEST_ENV_PATH});
 const schema='module_test_'+randomBytes(6).toString('hex');
 assert.match(schema,/^module_test_[a-f0-9]{12}$/);
 process.env.PGSCHEMA=schema;
 const bootstrap=new pg.Pool(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,user:process.env.PGUSER,password:process.env.PGPASSWORD});
 let appPool:pg.Pool|undefined;
 try{
  await bootstrap.query('CREATE SCHEMA '+schema);
  const connection=await bootstrap.connect();
  try{
   await connection.query('SET search_path TO '+schema);
   const source=readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8').replace('CREATE SCHEMA IF NOT EXISTS cr_management;','').replace('SET search_path TO cr_management;','SET search_path TO '+schema+';');
   await connection.query(source);
   const migration=readFileSync(new URL('../database/migrations/20261006_module_classification.sql',import.meta.url),'utf8');
   await connection.query(migration);await connection.query(migration);
   assert.equal(Number((await connection.query('SELECT count(*) FROM module_master')).rows[0].count),12);
   await connection.query("UPDATE module_master SET name='Maintained PP',is_active=false WHERE code='PP'");
   await connection.query(migration);
   const pp=(await connection.query("SELECT name,is_active FROM module_master WHERE code='PP'")).rows[0];assert.equal(pp.name,'Maintained PP');assert.equal(pp.is_active,false);
   await assert.rejects(connection.query("INSERT INTO module_master(module_group,code,name) VALUES ('SAP','MM','Duplicate')"),(e:any)=>e.code==='23505');
   const {rows}=await connection.query("INSERT INTO app_users(username,password_hash,role) VALUES ('MODULE_ADMIN','fixture','ADMIN') RETURNING id"); const adminId=Number(rows[0].id);
   await connection.query(migration);assert.equal((await connection.query("SELECT 1 FROM app_user_permissions WHERE user_id=$1 AND permission_key='master_data.modules'",[adminId])).rowCount,1);
   const actor={id:adminId,username:'MODULE_ADMIN',role:'ADMIN',mustChangePassword:false,isReminder:false,permissions:['issue.view','issue.edit','issue.create','issue.cr_references','issue.glpi_references','issue.helpdesk_references']} as any;
   appPool=(await import('../src/server/db/pool.js')).pool;
   const catalog=await import('../src/server/db/moduleRepository.js');const issues=await import('../src/server/db/issueRepository.js');
   const modules=await catalog.listModules();const mm=modules.find(m=>m.code==='MM')!;const olap=modules.find(m=>m.code==='OLAP')!;
   const created=await catalog.createModule({group:'NON-SAP',code:' test ',name:'Test module',isActive:true},actor);assert.equal(created.code,'TEST');
   await catalog.updateModule(created.id,{group:'NON-SAP',code:'TEST',name:'Edited',isActive:false},actor);
   let detail=await issues.saveIssue({issueName:'Mixed classification',moduleIds:[mm.id,olap.id,mm.id]},actor);
   const id=Number(detail.issue!.id);assert.deepEqual(detail.issue!.modules.map((m:any)=>Number(m.id)).sort((a:number,b:number)=>a-b),[mm.id,olap.id].sort((a,b)=>a-b));
   detail=await issues.saveIssue({id,issueNo:detail.issue!.issue_no,issueName:'Legacy edit'},actor);assert.equal(detail.issue!.modules.length,2);
   const filtered=await issues.listIssues({moduleIds:[mm.id,olap.id],pageSize:1});assert.equal(filtered.total,1);assert.equal(filtered.rows.length,1);
   const {exportIssueReport}=await import('../src/server/services/reportExportService.js');
   const workbook=await exportIssueReport({moduleIds:[mm.id,olap.id]});const xml=workbook.toString('utf8');
   assert.match(xml,/>Modules</);assert.match(xml,/NON-SAP: OLAP; SAP: MM/);assert.equal((xml.match(/Legacy edit/g)||[]).length,1);
   await catalog.updateModule(mm.id,{...mm,description:mm.description||'',isActive:false},actor);
   detail=await issues.saveIssue({id,issueNo:detail.issue!.issue_no,issueName:'Retain inactive',moduleIds:[mm.id,olap.id]},actor);assert.equal(detail.issue!.modules.length,2);
   const before=(await connection.query('SELECT count(*) FROM activity_logs')).rows[0].count;
   await assert.rejects(issues.saveIssue({id,issueNo:detail.issue!.issue_no,issueName:'Should rollback',moduleIds:[created.id]},actor));
   assert.equal((await issues.getIssueDetail(id)).issue!.issue_name,'Retain inactive');assert.equal((await connection.query('SELECT count(*) FROM activity_logs')).rows[0].count,before);
   detail=await issues.saveIssue({id,issueNo:detail.issue!.issue_no,issueName:'Cleared',moduleIds:[]},actor);assert.equal(detail.issue!.modules.length,0);
   assert.equal((await issues.listIssues({moduleAssignment:'unassigned'})).total,1);
   // A writer holds the row until commit; assignment must observe deactivation.
   const locker=await appPool.connect();await locker.query('BEGIN');await locker.query('UPDATE module_master SET is_active=false WHERE id=$1',[olap.id]);
   const assignment=issues.saveIssue({id,issueNo:detail.issue!.issue_no,issueName:'Concurrent',moduleIds:[olap.id]},actor);
   const failed=assert.rejects(assignment,/inactive/);await locker.query('COMMIT');locker.release();await failed;
   assert.equal((await issues.getIssueDetail(id)).issue!.issue_name,'Cleared');
   await issues.deleteIssue(id);assert.equal((await connection.query('SELECT count(*) FROM issue_module_links')).rows[0].count,'0');
  }finally{connection.release();}
 }finally{
  if(appPool)await appPool.end();
  // Only the randomly generated fixture schema may be removed.
  if(/^module_test_[a-f0-9]{12}$/.test(schema))await bootstrap.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await bootstrap.end();
 }
});
