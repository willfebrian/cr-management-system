import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import express from 'express';
import {createModuleRoutes} from '../src/server/routes/moduleRoutes.js';
import {pool} from '../src/server/db/pool.js';
after(()=>pool.end());
test('Issue view permits lookup without Master Data write access',async()=>{
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.authUser={id:1,username:'USER',role:'USER',mustChangePassword:false,isReminder:false,permissions:['issue.view']};next()});
 app.use(createModuleRoutes({listModules:async()=>[{id:2,group:'NON-SAP',code:'OLAP',name:'OLAP',description:null,isActive:true}],createModule:async()=>{throw Error('must not write')},updateModule:async()=>{throw Error('must not write')}}));
 const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const address=server.address() as any;const base='http://127.0.0.1:'+address.port;assert.equal((await fetch(base+'/value-help/modules')).status,200);assert.equal((await fetch(base+'/admin/modules',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);}
 finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
