import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {moduleIdsFromModules,toggleModuleSelection} from '../src/client/components/modules/moduleSelection.js';
import {IssueModuleSummary} from '../src/client/components/modules/IssueModuleSummary.js';
test('server group ordering and picker ordering share a clean saved baseline',()=>{
 const server=[{id:11},{id:2},{id:1}];const submitted=toggleModuleSelection(moduleIdsFromModules([{id:11},{id:2}]),1);
 assert.deepEqual(submitted,[1,2,11]);assert.equal(JSON.stringify(moduleIdsFromModules(server)),JSON.stringify(submitted));
});
test('removing and readding an original module clears module dirty state',()=>{const baseline=moduleIdsFromModules([{id:11},{id:2}]);assert.deepEqual(toggleModuleSelection(toggleModuleSelection(baseline,2),2),baseline);assert.deepEqual(moduleIdsFromModules(undefined),[]);});
test('read-only Issue detail includes inactive module classification',()=>{const html=renderToStaticMarkup(React.createElement(IssueModuleSummary,{modules:[{id:1,group:'SAP',code:'PP',name:'Production Planning',description:null,isActive:false}]}));assert.match(html,/Modules/);assert.match(html,/SAP: PP/);assert.match(html,/Inactive/);});
