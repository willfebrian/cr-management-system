import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {pool} from '../src/server/db/pool.js';
import {createModule,updateModule} from '../src/server/db/moduleRepository.js';
const actor={id:1,username:'ADMIN',role:'ADMIN',mustChangePassword:false,permissions:[],isReminder:false} as any;
after(()=>pool.end());
test('normalizes create and audits the actor within the transaction',async()=>{
 const original=pool.connect; const calls:any[]=[];
 (pool as any).connect=async()=>({query:async(sql:string,params:any[]=[])=>{calls.push({sql,params});return {rows:sql.includes('RETURNING')?[{id:4,group:'SAP',code:'PP',name:'Production Planning',description:null,isActive:true}]:[]}},release(){}});
 try {const result=await createModule({group:'SAP',code:' pp ',name:' Production Planning ',isActive:true},actor);assert.equal(result.code,'PP');assert.equal(calls[0].sql,'BEGIN');assert.equal(calls.at(-1).sql,'COMMIT');assert.ok(calls.some(c=>c.sql.includes('activity_logs')&&c.params.includes('ADMIN')));}finally{pool.connect=original;}
});
test('immutable code changes fail and roll back',async()=>{
 const original=pool.connect;const calls:string[]=[];
 (pool as any).connect=async()=>({query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('FOR UPDATE')?[{id:4,group:'SAP',code:'PP',name:'Production Planning',description:null,isActive:true}]:[]}},release(){}});
 try {await assert.rejects(updateModule(4,{group:'SAP',code:'MM',name:'Materials',isActive:true},actor),/cannot be changed/);assert.equal(calls.at(-1),'ROLLBACK');}finally{pool.connect=original;}
});
