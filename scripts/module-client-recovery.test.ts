import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchIssueModuleOptions} from '../src/client/api/modules.js';

test('HTML from an outdated server produces actionable feedback instead of a JSON syntax error', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!DOCTYPE html><p>Cannot GET /api/value-help/modules</p>', {status:404,headers:{'Content-Type':'text/html'}});
  try { await assert.rejects(fetchIssueModuleOptions(), /Restart the application server/); }
  finally {globalThis.fetch = original;}
});

test('invalid JSON and missing lookup rows cannot masquerade as an empty catalog', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('broken', {headers:{'Content-Type':'application/json'}});
    await assert.rejects(fetchIssueModuleOptions(), /invalid response/i);
    globalThis.fetch = async () => new Response('{}', {headers:{'Content-Type':'application/json'}});
    await assert.rejects(fetchIssueModuleOptions(), /invalid response/i);
  } finally {globalThis.fetch = original;}
});

test('JSON authorization errors retain their message and a valid empty catalog is allowed', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({message:'Permission denied.'},{status:403});
    await assert.rejects(fetchIssueModuleOptions(), /Permission denied/);
    globalThis.fetch = async () => Response.json({rows:[]});
    assert.deepEqual(await fetchIssueModuleOptions(), []);
  } finally {globalThis.fetch = original;}
});
