import React,{useEffect,useState} from 'react';
import type {ModuleSummary} from '../../../shared/moduleTypes';
import {fetchIssueModuleOptions} from '../../api/modules';
import {ModulePicker} from './ModulePicker';
export function IssueModulesField({ids,storedModules,onChange,disabled}:{ids:number[];storedModules:ModuleSummary[];onChange:(ids:number[])=>void;disabled:boolean}){
 const [options,setOptions]=useState<ModuleSummary[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);fetchIssueModuleOptions().then(rows=>{if(active){setOptions(rows);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[retry]);
 const records=new Map([...storedModules,...options].map(m=>[m.id,m]));
 const selected=ids.map(id=>records.get(id)).filter((m):m is ModuleSummary=>!!m);
 return <div>{loading&&<p role="status">Loading modules...</p>}{error&&<p role="alert">{error} <button type="button" className="secondary" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}<ModulePicker options={options} selectedModules={selected} onChange={onChange} disabled={disabled||loading||!!error}/></div>;
}
