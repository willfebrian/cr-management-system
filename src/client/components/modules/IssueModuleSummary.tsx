import React from 'react';
import { Layers } from 'lucide-react';
import type { ModuleSummary } from '../../../shared/moduleTypes';
import { ModuleBadges } from './ModuleBadges';

export function IssueModuleSummary({ modules }: { modules: ModuleSummary[] }) {
  return (
    <section className="issue-module-summary" aria-label="Modules">
      <h3><Layers size={15} aria-hidden="true" />Modules</h3>
      <ModuleBadges modules={modules} />
    </section>
  );
}
