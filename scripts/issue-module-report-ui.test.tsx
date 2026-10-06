import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModuleReportFilters} from '../src/client/components/modules/ModuleReportFilters.js';
test('unassigned filters disable contradictory group and IDs',()=>{const html=renderToStaticMarkup(<ModuleReportFilters filters={{moduleAssignment:'unassigned'}} onChange={()=>{}}/>);assert.match(html,/Unassigned/);assert.match(html,/disabled/);assert.match(html,/Reset modules/);});
