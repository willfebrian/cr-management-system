import assert from 'node:assert/strict';
import test from 'node:test';
import { readMonitoringTable } from '../mcp/sap/monitoring-table-reader.mjs';

test('monitoring reads past a full page and preserves filters on subsequent calls', async () => {
  const calls = [];
  const tools = { sap_table_read_limited_normalized: async (options) => {
    calls.push(options);
    return { rows: options.rowSkip === 0 ? [{ TRKORR: 'A' }, { TRKORR: 'B' }] : [{ TRKORR: 'C' }] };
  }};
  const result = await readMonitoringTable(tools, { tableName: 'E070', rowCount: 2, where: ["AS4DATE >= '20261001'"] });
  assert.deepEqual(result.rows.map(row => row.TRKORR), ['A', 'B', 'C']);
  assert.deepEqual(calls.map(call => call.rowSkip), [0, 2]);
  assert.deepEqual(calls[1].where, calls[0].where);
});

test('monitoring propagates a later-page failure instead of returning partial success', async () => {
  const tools = { sap_table_read_limited_normalized: async ({ rowSkip }) => {
    if (rowSkip) throw new Error('SAP unavailable');
    return { rows: [{ TRKORR: 'A' }] };
  }};
  await assert.rejects(readMonitoringTable(tools, { tableName: 'E071', rowCount: 1 }), /SAP unavailable/);
});
