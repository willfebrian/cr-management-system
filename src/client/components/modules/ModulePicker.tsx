import React,{useState} from 'react';
import type {ModuleSummary} from '../../../shared/moduleTypes';
import {ModuleBadges} from './ModuleBadges';
import {toggleModuleSelection} from './moduleSelection';
export function ModulePicker({options,selectedModules,onChange,disabled=false}:{options:ModuleSummary[];selectedModules:ModuleSummary[];onChange:(ids:number[])=>void;disabled?:boolean}){
 const [search,setSearch]=useState('');
 const selectedIds=selectedModules.map(m=>m.id);
 const records=[...new Map([...options,...selectedModules].map(m=>[m.id,m])).values()];
 return <fieldset className="module-picker" disabled={disabled}><legend>Modules</legend><ModuleBadges modules={selectedModules}/>
 <label>Search modules<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code or name"/></label>
 <div className="module-options">{(['SAP','NON-SAP'] as const).map(group=><section key={group}><strong>{group}</strong>{records.filter(m=>m.group===group&&(!search||(m.code+' '+m.name).toLowerCase().includes(search.toLowerCase()))).map(m=><label className="module-option" key={m.id}><input type="checkbox" checked={selectedIds.includes(m.id)} disabled={disabled||(!m.isActive&&!selectedIds.includes(m.id))} onChange={()=>onChange(toggleModuleSelection(selectedIds,m.id))}/><span>{m.code} — {m.name}{!m.isActive?' (Inactive)':''}</span></label>)}</section>)}</div>
 </fieldset>;
}
