import type {ModuleGroup,ModuleSummary,ModuleSaveInput} from '../../shared/moduleTypes';
async function request<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{credentials:'include',...init});
 const data=await response.json();
 if(!response.ok)throw new Error(data.message||'Module request failed.');
 return data;
}
export async function fetchAdminModules(filters:{group?:ModuleGroup;active?:boolean;q?:string}={}):Promise<ModuleSummary[]>{
 const query=new URLSearchParams();for(const [key,value] of Object.entries(filters))if(value!==undefined&&value!=='')query.set(key,String(value));
 return (await request<{rows:ModuleSummary[]}>('/api/admin/modules?'+query)).rows;
}
export function createAdminModule(input:ModuleSaveInput){return request<ModuleSummary>('/api/admin/modules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});}
export function updateAdminModule(id:number,input:ModuleSaveInput){return request<ModuleSummary>('/api/admin/modules/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});}
export async function fetchIssueModuleOptions():Promise<ModuleSummary[]>{return (await request<{rows:ModuleSummary[]}>('/api/value-help/modules')).rows;}
export async function fetchReportModuleOptions():Promise<ModuleSummary[]>{return (await request<{rows:ModuleSummary[]}>('/api/value-help/modules/report')).rows;}
