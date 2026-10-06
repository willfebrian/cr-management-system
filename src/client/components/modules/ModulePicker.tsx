import React, { useState } from 'react';
import { Layers, Search } from 'lucide-react';
import type { ModuleSummary } from '../../../shared/moduleTypes';
import { ModuleBadges } from './ModuleBadges';
import { toggleModuleSelection } from './moduleSelection';

export function ModulePicker({ options, selectedModules, onChange, disabled = false }: {
  options: ModuleSummary[];
  selectedModules: ModuleSummary[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const selectedIds = selectedModules.map(module => module.id);
  const records = [...new Map([...options, ...selectedModules].map(module => [module.id, module])).values()];
  const query = search.trim().toLowerCase();
  const matching = records.filter(module => !query || `${module.code} ${module.name}`.toLowerCase().includes(query));

  return (
    <fieldset className="module-picker" disabled={disabled}>
      <legend><Layers size={15} aria-hidden="true" /> Modules</legend>
      <div className="module-picker-meta">
        <span>Select one or more modules across groups.</span>
        <span className="module-selection-count">{selectedModules.length} selected</span>
      </div>
      {selectedModules.length > 0 && <ModuleBadges modules={selectedModules} />}
      <label className="module-search">
        <span className="module-search-label">Search modules</span>
        <span className="module-search-input"><Search size={16} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search code or name" /></span>
      </label>
      {records.length > 0 ? (
        <div className="module-options">
          {(['SAP', 'NON-SAP'] as const).map(group => {
            const groupModules = matching.filter(module => module.group === group).sort((a, b) => a.code.localeCompare(b.code));
            return (
              <section className="module-option-group" key={group} aria-label={`${group} modules`}>
                <div className="module-group-heading"><strong>{group}</strong><span>{groupModules.length}</span></div>
                {groupModules.length ? groupModules.map(module => (
                  <label className={`module-option${selectedIds.includes(module.id) ? ' is-selected' : ''}`} key={module.id}>
                    <input type="checkbox" aria-label={`${module.code} — ${module.name}${!module.isActive ? ' (Inactive)' : ''}`} checked={selectedIds.includes(module.id)} disabled={disabled || (!module.isActive && !selectedIds.includes(module.id))} onChange={() => onChange(toggleModuleSelection(selectedIds, module.id))} />
                    <span className="module-option-copy"><strong>{module.code}{!module.isActive && <small>Inactive</small>}</strong><span>{module.name}</span></span>
                  </label>
                )) : <p className="module-group-empty">No matching modules.</p>}
              </section>
            );
          })}
        </div>
      ) : <p className="module-picker-empty">{disabled ? 'Module choices are unavailable.' : 'No active modules are available.'}</p>}
    </fieldset>
  );
}
