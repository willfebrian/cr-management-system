import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModuleMasterTable} from '../src/client/components/modules/ModuleMasterPanel.js';
const modules=[{id:1,group:'SAP' as const,code:'PP',name:'Production Planning',description:null,isActive:false}];
test('view-only catalog hides maintenance actions and shows inactive module',()=>{const html=renderToStaticMarkup(<ModuleMasterTable modules={modules} canManage={false} onEdit={()=>{}} onToggle={()=>{}}/>);assert.match(html,/Production Planning/);assert.match(html,/Inactive/);assert.doesNotMatch(html,/>Edit</);});
test('maintainer can edit or reactivate inactive module',()=>{const html=renderToStaticMarkup(<ModuleMasterTable modules={modules} canManage onEdit={()=>{}} onToggle={()=>{}}/>);assert.match(html,/>Edit</);assert.match(html,/>Reactivate</);});
