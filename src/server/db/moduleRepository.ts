import {pool} from './pool.js';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../auth/authService.js';
import type {ModuleGroup,ModuleSummary,ModuleSaveInput} from '../../shared/moduleTypes.js';
import {ModuleError,normalizeModuleInput,normalizeModuleIds} from '../modules/moduleDomain.js';
export const MODULE_COLUMNS = 'id, module_group AS "group", code, name, description, is_active AS "isActive"';
export async function listModules(filters: {group?:ModuleGroup;active?:boolean;q?:string} = {}): Promise<ModuleSummary[]> {
 const params:unknown[]=[]; const where:string[]=[];
 if(filters.group){where.push('module_group = $'+(params.push(filters.group)));}
 if(filters.active!==undefined){where.push('is_active = $'+params.push(filters.active));}
 if(filters.q){where.push('(code ILIKE $'+(params.length+1)+' OR name ILIKE $'+(params.length+1)+')');params.push('%'+filters.q+'%');}
 const {rows}=await pool.query('SELECT '+MODULE_COLUMNS+' FROM module_master '+(where.length?'WHERE '+where.join(' AND '):'')+' ORDER BY module_group,code,id',params);
 return rows.map(row=>({...row,id:Number(row.id)}));
}
export async function writeModuleAudit(client:PoolClient,actor:AuthUser,action:string,description:string,metadata:Record<string,unknown>,type='master_data') {
 await client.query('INSERT INTO activity_logs (activity_type,action,username,user_id,description,metadata) VALUES ($1,$2,$3,$4,$5,$6)',[type,action,actor.username,actor.id,description,JSON.stringify(metadata)]);
}
export async function createModule(input:ModuleSaveInput,actor:AuthUser):Promise<ModuleSummary>{return saveModule(undefined,input,actor);}
export async function updateModule(id:number,input:ModuleSaveInput,actor:AuthUser):Promise<ModuleSummary>{normalizeModuleIds([id]);return saveModule(id,input,actor);}
async function saveModule(id:number|undefined,input:ModuleSaveInput,actor:AuthUser):Promise<ModuleSummary>{
 const data=normalizeModuleInput(input);const client=await pool.connect();
 try{
  await client.query('BEGIN');
  let before:ModuleSummary|undefined;
  if(id){before=(await client.query('SELECT '+MODULE_COLUMNS+' FROM module_master WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!before)throw new ModuleError('Module not found.',404);if(before.group!==data.group||before.code!==data.code)throw new ModuleError('Module group and code cannot be changed.');}
  const params=[data.group,data.code,data.name,data.description||null,data.isActive];
  const {rows}=id?await client.query('UPDATE module_master SET name=$1,description=$2,is_active=$3,updated_at=now() WHERE id=$4 RETURNING '+MODULE_COLUMNS,[data.name,data.description||null,data.isActive,id]):await client.query('INSERT INTO module_master (module_group,code,name,description,is_active) VALUES ($1,$2,$3,$4,$5) RETURNING '+MODULE_COLUMNS,params);
  const result={...rows[0],id:Number(rows[0].id)} as ModuleSummary;
  await writeModuleAudit(client,actor,id?'update_module':'create_module','Module '+result.code+' '+(id?'updated':'created'),{before:before||null,after:result});
  await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');if((error as any).code==='23505')throw new ModuleError('A module with this group and code already exists.',409,'DUPLICATE_MODULE');throw error;}finally{client.release();}
}
