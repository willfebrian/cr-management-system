import React from 'react';
import type {ModuleSummary} from '../../../shared/moduleTypes';
import {ModuleBadges} from './ModuleBadges';
export function IssueModuleSummary({modules}:{modules:ModuleSummary[]}){
 return <section className="issue-detail-section" aria-label="Modules"><h3>Modules</h3><ModuleBadges modules={modules}/></section>;
}
