import assert from 'node:assert/strict';
import test from 'node:test';
import {parseModuleFilters,appendModuleFilters} from '../src/server/modules/moduleFilters.js';
test('parses comma-separated positive IDs and rejects invalid combinations',()=>{
 assert.deepEqual(parseModuleFilters({moduleGroup:'SAP',moduleIds:'2,1,2'}),{moduleGroup:'SAP',moduleIds:[1,2],moduleAssignment:undefined});
 for(const query of [{moduleIds:'0'},{moduleIds:'1.5'},{moduleIds:'abc'},{moduleGroup:'other'},{moduleAssignment:'unassigned',moduleGroup:'SAP'},{moduleAssignment:'unassigned',moduleIds:'1'}])assert.throws(()=>parseModuleFilters(query));
});
test('multiple module matches use EXISTS without joining duplicate Issue rows',()=>{
 const where:string[]=[];const params:unknown[]=[];appendModuleFilters({moduleGroup:'SAP',moduleIds:[2,1]},where,params);
 assert.deepEqual(params,['SAP',[1,2]]);assert.equal(where.length,2);assert.ok(where.every(s=>s.includes('EXISTS')));assert.match(where[1],/ANY/);
 const absent:string[]=[];appendModuleFilters({moduleAssignment:'unassigned'},absent,[]);assert.match(absent[0],/NOT EXISTS/);
});
