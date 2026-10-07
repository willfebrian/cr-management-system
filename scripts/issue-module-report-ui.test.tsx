import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModuleReportFilters} from '../src/client/components/modules/ModuleReportFilters.js';
test('unassigned filters disable contradictory group and IDs',()=>{const html=renderToStaticMarkup(<ModuleReportFilters filters={{moduleAssignment:'unassigned'}} onChange={()=>{}}/>);assert.match(html,/Unassigned/);assert.match(html,/disabled/);assert.match(html,/Reset modules/);});

test('filter uses an accessible toolbar button and explicit checkbox selection rather than a native multi-select',()=>{
 const html=renderToStaticMarkup(<ModuleReportFilters filters={{moduleGroup:'SAP',moduleIds:[1,2]}} onChange={()=>{}}/>);
 assert.match(html,/aria-haspopup="dialog"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/Module filters/);
 assert.match(html,/Search filter modules/);
 assert.match(html,/2 selected/);
 assert.match(html,/aria-pressed="true"/);
 assert.doesNotMatch(html,/<select/);
});
