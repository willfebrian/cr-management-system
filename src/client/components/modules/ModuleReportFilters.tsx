import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Layers, Search, X } from 'lucide-react';
import type { IssueFilters } from '../../api';
import type { ModuleSummary, ModuleGroup } from '../../../shared/moduleTypes';
import { fetchReportModuleOptions } from '../../api/modules';
import { toggleModuleSelection } from './moduleSelection';

export function ModuleReportFilters({ filters, onChange }: { filters: IssueFilters; onChange: (filters: IssueFilters) => void }) {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchReportModuleOptions().then(rows => { if (active) setModules(rows); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load modules.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  const unassigned = filters.moduleAssignment === 'unassigned';
  const ids = filters.moduleIds || [];
  const activeFilter = !!(ids.length || filters.moduleGroup || filters.moduleAssignment);
  const query = search.trim().toLowerCase();
  const matching = modules.filter(module => (!filters.moduleGroup || module.group === filters.moduleGroup) && (!query || `${module.code} ${module.name}`.toLowerCase().includes(query)));
  const update = (patch: Partial<IssueFilters>) => onChange({ ...filters, ...patch, page: 1 });
  return (
    <div className="module-report-filter" ref={root} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }}>
      <button className={`module-report-trigger${activeFilter ? ' is-active' : ''}`} type="button" ref={trigger} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
        <Layers size={15} aria-hidden="true" /><span>Modules</span>{activeFilter && <span className="module-filter-count">{ids.length || 1}</span>}<ChevronDown size={14} aria-hidden="true" className={open ? 'is-open' : ''} />
      </button>
      <div id={panelId} role="dialog" aria-label="Module filters" hidden={!open} className="module-report-popover">
        <header className="module-filter-header"><div><strong>Module filters</strong><small>Refine Issues by module classification.</small></div><button type="button" aria-label="Close module filters" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16} /></button></header>
        <div className="module-filter-section"><span className="module-filter-label">Assignment</span><div className="module-filter-segments" role="group" aria-label="Assignment">
          {([['', 'All Issues'], ['assigned', 'Assigned'], ['unassigned', 'Unassigned']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={(filters.moduleAssignment || '') === value} onClick={() => update({ moduleAssignment: value || undefined, ...(value === 'unassigned' ? { moduleGroup: undefined, moduleIds: undefined } : {}) })}>{label}</button>)}
        </div></div>
        <div className="module-filter-section"><span className="module-filter-label">Group</span><div className="module-filter-segments" role="group" aria-label="Module group">
          {([['', 'All groups'], ['SAP', 'SAP'], ['NON-SAP', 'NON-SAP']] as const).map(([value, label]) => <button key={value} type="button" disabled={unassigned} aria-pressed={(filters.moduleGroup || '') === value} onClick={() => update({ moduleGroup: (value || undefined) as ModuleGroup | undefined, moduleIds: undefined })}>{label}</button>)}
        </div></div>
        <div className="module-filter-section"><div className="module-filter-list-heading"><span className="module-filter-label">Modules</span><small>{ids.length} selected</small></div>
          <label className="module-filter-search"><Search size={15} aria-hidden="true" /><input aria-label="Search filter modules" placeholder="Search code or name" value={search} disabled={unassigned} onChange={event => setSearch(event.target.value)} /></label>
          {unassigned ? <p className="module-filter-hint">Showing Issues with no module assigned.</p> : <>
            <p className="module-filter-hint">Issues matching any selected module are shown.</p>
            {loading ? <p role="status" className="module-filter-hint">Loading modules...</p> : error ? <div role="alert" className="module-load-error"><AlertCircle size={16} /><div><p>{error}</p><button className="module-refresh" type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div></div> : <div className="module-filter-options">
              {(['SAP', 'NON-SAP'] as const).filter(group => !filters.moduleGroup || group === filters.moduleGroup).map(group => {
                const choices = matching.filter(module => module.group === group).sort((a, b) => a.code.localeCompare(b.code));
                return choices.length ? <section key={group} aria-label={`${group} filter modules`}><div className="module-group-heading"><strong>{group}</strong><span>{choices.length}</span></div>{choices.map(module => <label className={`module-filter-option${ids.includes(module.id) ? ' is-selected' : ''}`} key={module.id}><input type="checkbox" checked={ids.includes(module.id)} onChange={() => update({ moduleIds: toggleModuleSelection(ids, module.id) })} aria-label={`${module.group}: ${module.code}${!module.isActive ? ' (Inactive)' : ''}`} /><span><strong>{module.code}{!module.isActive && <small>Inactive</small>}</strong><small>{module.name}</small></span>{ids.includes(module.id) && <Check size={14} aria-hidden="true" />}</label>)}</section> : null;
              })}
              {!matching.length && <p className="module-filter-hint">{query ? 'No matching modules.' : 'No modules available.'}</p>}
            </div>}
          </>}
        </div>
        <footer className="module-filter-footer"><button type="button" className="module-filter-reset" disabled={!activeFilter} onClick={() => { setSearch(''); update({ moduleGroup: undefined, moduleIds: undefined, moduleAssignment: undefined }); }}>Reset modules</button><button type="button" className="module-filter-done" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button></footer>
      </div>
    </div>
  );
}
