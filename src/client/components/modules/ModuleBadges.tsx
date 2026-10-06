import React from 'react';
import type {ModuleSummary} from '../../../shared/moduleTypes';
export function ModuleBadges({modules}:{modules:ModuleSummary[]}){
 return <div className="module-badges">{modules.length?modules.map(m=><span className="module-badge" key={m.id} title={m.name}>{m.group}: {m.code}{!m.isActive?' (Inactive)':''}</span>):<span className="module-empty">Unassigned</span>}</div>;
}
