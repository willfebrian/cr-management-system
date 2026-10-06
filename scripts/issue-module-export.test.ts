import assert from 'node:assert/strict';
import test from 'node:test';
import {formatModules} from '../src/shared/moduleTypes.js';
test('export module text is stable and includes both groups',()=>{
 const base={name:'Name',description:null,isActive:true};
 assert.equal(formatModules([{...base,id:2,group:'SAP',code:'PP'},{...base,id:1,group:'SAP',code:'MM'},{...base,id:3,group:'NON-SAP',code:'OLAP'}]),'NON-SAP: OLAP; SAP: MM; SAP: PP');
 assert.equal(formatModules([]),'');
});
