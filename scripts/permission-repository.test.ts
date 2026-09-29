import assert from "node:assert/strict";
import test from "node:test";
import { listUserPermissions, replaceUserPermissions } from "../src/server/auth/permissionRepository";

test("listUserPermissions returns ordered grants", async () => {
  const query = async (_sql: string, params: unknown[]) => {
    assert.deepEqual(params, [12]);
    return { rows: [{ permission_key: "issue.view" }, { permission_key: "issue.helpdesk_references" }] };
  };
  assert.deepEqual(await listUserPermissions(12, query), ["issue.view", "issue.helpdesk_references"]);
});

test("listUserPermissions returns empty grants", async () => {
  assert.deepEqual(await listUserPermissions(12, async () => ({ rows: [] })), []);
});

test("replaceUserPermissions uses caller transaction", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return { rows: [] };
  } };
  await replaceUserPermissions(client as never, 12, ["issue.view", "issue.helpdesk_references"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /DELETE FROM app_user_permissions/i);
  assert.deepEqual(calls[0].params, [12]);
  assert.match(calls[1].sql, /INSERT INTO app_user_permissions/i);
  assert.deepEqual(calls[1].params, [12, ["issue.view", "issue.helpdesk_references"]]);
});
