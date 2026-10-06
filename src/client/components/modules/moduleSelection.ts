export function toggleModuleSelection(ids:number[],id:number):number[]{return ids.includes(id)?ids.filter(value=>value!==id):[...ids,id].sort((a,b)=>a-b);}
