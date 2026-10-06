import type {ModuleGroup} from '../../shared/moduleTypes.js';
import {ModuleError,normalizeModuleIds} from './moduleDomain.js';
export type ModuleFilters={moduleGroup?:ModuleGroup;moduleIds?:number[];moduleAssignment?:'assigned'|'unassigned'};
export function parseModuleFilters(query:Record<string,unknown>):ModuleFilters{
 const group=query.moduleGroup;const assignment=query.moduleAssignment;
 if(group!==undefined&&group!==''&&group!=='SAP'&&group!=='NON-SAP')throw new ModuleError('Invalid module group.');
 if(assignment!==undefined&&assignment!==''&&assignment!=='assigned'&&assignment!=='unassigned')throw new ModuleError('Invalid module assignment filter.');
 let ids:number[]|undefined;
 if(query.moduleIds!==undefined&&query.moduleIds!==''){
  if(typeof query.moduleIds!=='string'||!/^\d+(,\d+)*$/.test(query.moduleIds))throw new ModuleError('Invalid module ID filter.');
  ids=normalizeModuleIds(query.moduleIds.split(',').map(Number));
 }
 const filters={moduleGroup:group||undefined,moduleIds:ids,moduleAssignment:assignment||undefined} as ModuleFilters;
 validate(filters);return filters;
}
function validate(filters:ModuleFilters){
 if(filters.moduleGroup!==undefined&&!['SAP','NON-SAP'].includes(filters.moduleGroup))throw new ModuleError('Invalid module group.');
 if(filters.moduleAssignment!==undefined&&!['assigned','unassigned'].includes(filters.moduleAssignment))throw new ModuleError('Invalid module assignment filter.');
 if(filters.moduleAssignment==='unassigned'&&(filters.moduleGroup||filters.moduleIds?.length))throw new ModuleError('Unassigned cannot be combined with group or module filters.');
}
export function appendModuleFilters(filters:ModuleFilters,where:string[],params:unknown[]):void{
 validate(filters);
 if(filters.moduleGroup){params.push(filters.moduleGroup);where.push('EXISTS (SELECT 1 FROM issue_module_links im JOIN module_master m ON m.id=im.module_id WHERE im.issue_id=h.id AND m.module_group=$'+params.length+')');}
 if(filters.moduleIds?.length){params.push(normalizeModuleIds(filters.moduleIds));where.push('EXISTS (SELECT 1 FROM issue_module_links im WHERE im.issue_id=h.id AND im.module_id=ANY($'+params.length+'::bigint[]))');}
 if(filters.moduleAssignment)where.push((filters.moduleAssignment==='unassigned'?'NOT ':'')+'EXISTS (SELECT 1 FROM issue_module_links im WHERE im.issue_id=h.id)');
}
