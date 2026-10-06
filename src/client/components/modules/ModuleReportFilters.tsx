import React,{useEffect,useState} from 'react';
import type {IssueFilters} from '../../api';
import type {ModuleSummary,ModuleGroup} from '../../../shared/moduleTypes';
import {fetchReportModuleOptions} from '../../api/modules';
export function ModuleReportFilters({filters,onChange}:{filters:IssueFilters;onChange:(filters:IssueFilters)=>void}){
 const [modules,setModules]=useState<ModuleSummary[]>([]);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;fetchReportModuleOptions().then(rows=>{if(active){setModules(rows);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false};},[retry]);
 const unassigned=filters.moduleAssignment==='unassigned';const count=filters.moduleIds?.length||0;
 return <details className="module-report-filter"><summary>Modules{count?' ('+count+')':''}</summary><div className="module-report-popover">
 <label>Assignment<select value={filters.moduleAssignment||''} onChange={e=>onChange({...filters,moduleAssignment:e.target.value as IssueFilters['moduleAssignment']||undefined,moduleGroup:e.target.value==='unassigned'?undefined:filters.moduleGroup,moduleIds:e.target.value==='unassigned'?undefined:filters.moduleIds,page:1})}><option value="">All Issues</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
 <label>Group<select disabled={unassigned} value={filters.moduleGroup||''} onChange={e=>onChange({...filters,moduleGroup:e.target.value as ModuleGroup||undefined,moduleIds:undefined,page:1})}><option value="">All groups</option><option>SAP</option><option>NON-SAP</option></select></label>
 <label>Modules<select multiple size={6} disabled={unassigned||!!error} value={(filters.moduleIds||[]).map(String)} onChange={e=>onChange({...filters,moduleIds:Array.from(e.target.selectedOptions,option=>Number(option.value)),page:1})}>{modules.filter(m=>!filters.moduleGroup||m.group===filters.moduleGroup).map(m=><option key={m.id} value={m.id}>{m.group}: {m.code}{!m.isActive?' (Inactive)':''}</option>)}</select></label>
 {error&&<p role="alert">{error}<button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
 <button type="button" className="secondary" onClick={()=>onChange({...filters,moduleGroup:undefined,moduleIds:undefined,moduleAssignment:undefined,page:1})}>Reset modules</button>
 </div></details>;
}
