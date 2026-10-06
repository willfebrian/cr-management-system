import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModuleInput, normalizeModuleIds, ModuleError } from '../src/server/modules/moduleDomain.js';
test('normalizes code and name for catalog uniqueness', () => {
  assert.deepEqual(normalizeModuleInput({group:'SAP',code:' pp ',name:' Production Planning ',isActive:true}), {group:'SAP',code:'PP',name:'Production Planning',description:'',isActive:true});
});
test('rejects unsupported groups and empty catalog values', () => {
  for (const input of [{group:'OTHER',code:'PP',name:'Production'}, {group:'SAP',code:' ',name:'Production'}, {group:'SAP',code:'PP',name:''}]) assert.throws(() => normalizeModuleInput({...input,isActive:true} as any), ModuleError);
});
test('deduplicates IDs and rejects nonpositive fractional unsafe or coerced IDs', () => {
  assert.deepEqual(normalizeModuleIds([2,2,1]), [1,2]);
  for (const ids of [[0],[-1],[1.2],[Number.MAX_SAFE_INTEGER+1],['1'],null,{}]) assert.throws(() => normalizeModuleIds(ids), ModuleError);
});
