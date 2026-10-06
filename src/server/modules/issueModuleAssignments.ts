import type {PoolClient} from 'pg';
import type {AuthUser} from '../auth/authService.js';
import {normalizeModuleIds,ModuleError} from './moduleDomain.js';
import {writeModuleAudit} from '../db/moduleRepository.js';
export async function replaceIssueModules(client:PoolClient,issueId:number,input:number[],actor:AuthUser):Promise<void>{
 const ids=normalizeModuleIds(input);
 const stored=(await client.query('SELECT module_id FROM issue_module_links WHERE issue_id=$1 ORDER BY module_id',[issueId])).rows.map(r=>Number(r.module_id));
 if(ids.length){
  const records=(await client.query('SELECT id,is_active FROM module_master WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[ids])).rows;
  if(records.length!==ids.length)throw new ModuleError('One or more modules no longer exist.');
  if(records.some(r=>!r.is_active&&!stored.includes(Number(r.id))))throw new ModuleError('A selected module is inactive. Refresh the module list.',409,'INACTIVE_MODULE');
 }
 if(JSON.stringify(stored)===JSON.stringify(ids))return;
 await client.query('DELETE FROM issue_module_links WHERE issue_id=$1',[issueId]);
 if(ids.length)await client.query('INSERT INTO issue_module_links (issue_id,module_id) SELECT $1,unnest($2::bigint[])',[issueId,ids]);
 await writeModuleAudit(client,actor,'update_issue_modules','Updated Issue module classification',{issueId,before:stored,after:ids},'issue');
}
export function issueModulesSql(issueIdExpression:string):string {
 return `COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'group',m.module_group,'code',m.code,'name',m.name,'description',m.description,'isActive',m.is_active) ORDER BY m.module_group,m.code,m.id) FROM issue_module_links im JOIN module_master m ON m.id=im.module_id WHERE im.issue_id=${issueIdExpression}), '[]'::jsonb)`;
}
