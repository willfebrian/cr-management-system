import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ModuleSummary } from '../../../shared/moduleTypes';
import { fetchIssueModuleOptions } from '../../api/modules';
import { ModulePicker } from './ModulePicker';

export function IssueModulesField({ ids, storedModules, onChange, disabled }: {
  ids: number[];
  storedModules: ModuleSummary[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const [options, setOptions] = useState<ModuleSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchIssueModuleOptions()
      .then(rows => { if (active) setOptions(rows); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load modules. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const records = new Map([...storedModules, ...options].map(module => [module.id, module]));
  const selected = ids.map(id => records.get(id)).filter((module): module is ModuleSummary => !!module);

  return (
    <div className="issue-modules-field" aria-busy={loading}>
      <div className="module-load-toolbar">
        <span role="status">{loading ? 'Loading modules...' : error ? 'Module choices unavailable' : 'Optional classification'}</span>
        <button type="button" className="module-refresh" disabled={disabled || loading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />{error ? 'Retry' : 'Refresh'}</button>
      </div>
      {error && <div className="module-load-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><div><strong>Unable to load modules</strong><p>{error}</p></div></div>}
      <ModulePicker options={options} selectedModules={selected} onChange={onChange} disabled={disabled || loading || !!error} />
    </div>
  );
}
