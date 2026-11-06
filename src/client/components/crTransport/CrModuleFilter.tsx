import { useEffect, useState } from "react";
import { fetchCrModuleOptions } from "../../api";
import type { ModuleSummary } from "../../../shared/moduleTypes";

export function CrModuleFilter({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    fetchCrModuleOptions().then(result => { if (active) setModules(result.rows); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="cr-workspace-module-filter">
    <label className="cr-workspace-filter">Module
      <select aria-label="Filter CR module" value={value || "all"} onChange={event => onChange(event.target.value)}>
        <option value="all">All Modules</option>
        <option value="unclassified">Unclassified</option>
        {modules.map(module => <option key={module.id} value={module.code}>{module.code} — {module.name}{module.isActive ? "" : " (Inactive)"}</option>)}
      </select>
    </label>
    {error ? <span role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></span> : null}
  </div>;
}
