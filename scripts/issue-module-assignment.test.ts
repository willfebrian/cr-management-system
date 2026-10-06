import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {replaceIssueModules} from '../src/server/modules/issueModuleAssignments.js';
import {pool} from '../src/server/db/pool.js';
const actor={id:1,username:'ADMIN'} as any;
after(()=>pool.end());
function fixture(existing:number[],records:any[]){
 const calls:any[]=[];const client={query:async(sql:string,params:any[]=[])=>{calls.push({sql,params});if(sql.includes('SELECT module_id'))return {rows:existing.map(module_id=>({module_id}))};if(sql.includes('FROM module_master'))return {rows:records};return {rows:[]}}};
 return {client:client as any,calls};
}
test('retains inactive existing modules and audits changed IDs',async()=>{
 const f=fixture([1],[{id:1,is_active:false},{id:2,is_active:true}]);await replaceIssueModules(f.client,9,[2,1,2],actor);
 assert.deepEqual(f.calls.find(c=>c.sql.includes('unnest'))?.params,[9,[1,2]]);
 assert.ok(f.calls.some(c=>c.sql.includes('FOR SHARE')));
 const audit=f.calls.find(c=>c.sql.includes('activity_logs'));assert.deepEqual(JSON.parse(audit.params[5]),{issueId:9,before:[1],after:[1,2]});
});
test('rejects inactive new or missing IDs before changing links',async()=>{
 for(const records of [[{id:2,is_active:false}],[]]){const f=fixture([],records);await assert.rejects(replaceIssueModules(f.client,9,[2],actor));assert.ok(!f.calls.some(c=>c.sql.startsWith('DELETE')));}
});
test('empty IDs clears links; identical set does not create audit',async()=>{
 const f=fixture([1],[]);await replaceIssueModules(f.client,9,[],actor);assert.ok(f.calls.some(c=>c.sql.startsWith('DELETE')));
 const same=fixture([1],[{id:1,is_active:false}]);await replaceIssueModules(same.client,9,[1],actor);assert.ok(!same.calls.some(c=>c.sql.includes('activity_logs')));
});
