import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("release operation schema persists one active operation per target request", () => {
  const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS release_operations/);
  assert.match(schema, /status IN \('queued', 'running'\)/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_release_operations_active/);
  assert.match(schema, /result JSONB/);
  assert.match(schema, /sync_status TEXT/);
});

test("createOrGetActiveReleaseOperation reuses the active database row", async () => {
  const repository = await import("../src/server/sap/transportReleaseOperationRepository.js").catch(() => null);
  assert.equal(typeof repository?.createOrGetActiveReleaseOperation, "function");

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return { rows: [{
      id: "42",
      trkorr: "TRDK924752",
      target_system: "DEV_AIX",
      status: "running",
      phase: "verifying",
      message: "Waiting for SAP confirmation",
      result: null,
      sync_status: "not_queued",
      sync_message: null,
      created_at: "2026-08-21T01:26:12.000Z",
      started_at: "2026-08-21T01:26:12.100Z",
      finished_at: null,
      updated_at: "2026-08-21T01:26:12.100Z"
    }] };
  };

  const operation = await repository!.createOrGetActiveReleaseOperation({
    trkorr: "trdk924752",
    targetSystem: "dev_aix"
  }, query);

  assert.equal(operation.id, "42");
  assert.equal(operation.trkorr, "TRDK924752");
  assert.equal(operation.targetSystem, "DEV_AIX");
  assert.equal(operation.status, "running");
  assert.match(calls[0].sql, /ON CONFLICT \(target_system, trkorr\)/);
  assert.deepEqual(calls[0].params, ["TRDK924752", "DEV_AIX"]);
});

test("updateReleaseOperation stores terminal result and completion time", async () => {
  const repository = await import("../src/server/sap/transportReleaseOperationRepository.js").catch(() => null);
  assert.equal(typeof repository?.updateReleaseOperation, "function");

  let executed: { sql: string; params: unknown[] } | undefined;
  const query = async (sql: string, params: unknown[]) => {
    executed = { sql, params };
    return { rows: [{
      id: "42",
      trkorr: "TRDK924752",
      target_system: "DEV_AIX",
      status: "succeeded",
      phase: "verifying",
      message: "RELEASE_COMPLETE",
      result: { ok: true, message: "RELEASE_COMPLETE", tasks: [] },
      sync_status: "queued",
      sync_message: null,
      created_at: "2026-08-21T01:26:12.000Z",
      started_at: "2026-08-21T01:26:12.100Z",
      finished_at: "2026-08-21T01:27:12.000Z",
      updated_at: "2026-08-21T01:27:12.000Z"
    }] };
  };

  const operation = await repository!.updateReleaseOperation("42", {
    status: "succeeded",
    message: "RELEASE_COMPLETE",
    result: { ok: true, message: "RELEASE_COMPLETE", tasks: [] },
    syncStatus: "queued"
  }, query);

  assert.equal(operation.status, "succeeded");
  assert.equal(operation.syncStatus, "queued");
  assert.match(executed!.sql, /finished_at = CASE/);
  assert.deepEqual(executed!.params.slice(0, 2), ["42", "succeeded"]);
});
