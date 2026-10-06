export function toggleModuleSelection(ids:number[],id:number):number[]{return ids.includes(id)?ids.filter(value=>value!==id):[...ids,id].sort((a,b)=>a-b);}

export function moduleIdsFromModules(modules: Array<{id:number}> | undefined):number[]{return (modules||[]).map(m=>m.id).sort((a,b)=>a-b);}
