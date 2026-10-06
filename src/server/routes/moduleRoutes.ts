import {Router} from 'express';
import {requirePermission} from '../auth/middleware.js';
import * as repository from '../db/moduleRepository.js';
import {ModuleError,normalizeModuleIds} from '../modules/moduleDomain.js';
import type {ModuleGroup} from '../../shared/moduleTypes.js';
export function createModuleRoutes(dependencies:Pick<typeof repository,'listModules'|'createModule'|'updateModule'>=repository){
 const routes=Router();
 routes.get("/admin/modules",requirePermission('master_data.view'),async(req,res,next)=>{try{
  const group=req.query.group;if(group!==undefined&&!['SAP','NON-SAP'].includes(String(group)))throw new ModuleError('Invalid module group.');
  if(req.query.active!==undefined&&!['true','false'].includes(String(req.query.active)))throw new ModuleError('Invalid active filter.');
  res.json({rows:await dependencies.listModules({group:group as ModuleGroup|undefined,active:req.query.active===undefined?undefined:req.query.active==='true',q:typeof req.query.q==='string'?req.query.q:undefined})});
 }catch(error){next(error);}});
 routes.get("/value-help/modules/report",requirePermission('issue.view'),async(_req,res,next)=>{try{res.json({rows:await dependencies.listModules()});}catch(error){next(error);}});
 routes.get("/value-help/modules",requirePermission('issue.view'),async(_req,res,next)=>{try{res.json({rows:await dependencies.listModules({active:true})});}catch(error){next(error);}});
 routes.post("/admin/modules",requirePermission('master_data.modules'),async(req,res,next)=>{try{res.status(201).json(await dependencies.createModule(req.body,req.authUser!));}catch(error){next(error);}});
 routes.put("/admin/modules/:id",requirePermission('master_data.modules'),async(req,res,next)=>{try{const id=Number(req.params.id);normalizeModuleIds([id]);res.json(await dependencies.updateModule(id,req.body,req.authUser!));}catch(error){next(error);}});
 return routes;
}
export const moduleRoutes=createModuleRoutes();
