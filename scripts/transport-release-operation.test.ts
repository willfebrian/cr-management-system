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

test("runReleaseOperation records SAP success before scheduling background sync", async () => {
  const service = await import("../src/server/sap/transportReleaseOperationService.js").catch(() => null);
  assert.equal(typeof service?.runReleaseOperation, "function");

  const events: string[] = [];
  const scheduled: Array<() => void> = [];
  const operation = {
    id: "42",
    trkorr: "TRDK924752",
    targetSystem: "DEV_AIX",
    status: "queued",
    phase: "queued",
    message: null,
    result: null,
    syncStatus: "not_queued",
    syncMessage: null,
    createdAt: "",
    startedAt: null,
    finishedAt: null,
    updatedAt: ""
  } as any;
  const releaseResult = {
    ok: true,
    message: "RELEASE_COMPLETE",
    mode: "RELEASE",
    trkorr: operation.trkorr,
    targetSystem: operation.targetSystem,
    targetServer: "TRD",
    hasErrors: false,
    hasWarnings: false,
    tasks: []
  };

  await service!.runReleaseOperation("42", {
    claim: async () => ({ ...operation, status: "running", phase: "verifying" }),
    update: async (_id: string, patch: any) => {
      events.push(`update:${patch.status}:${patch.syncStatus || ""}`);
      return { ...operation, ...patch };
    },
    updateSync: async () => operation,
    execute: async () => releaseResult,
    sync: async () => ({ ok: true, requestCount: 1 }),
    schedule: (work: () => void) => { scheduled.push(work); }
  });

  assert.deepEqual(events, ["update:succeeded:queued"]);
  assert.equal(scheduled.length, 1);
});

test("runReleaseOperation keeps complete SAP failure details and classifies timeout", async () => {
  const service = await import("../src/server/sap/transportReleaseOperationService.js").catch(() => null);
  assert.equal(typeof service?.runReleaseOperation, "function");

  const terminal: any[] = [];
  const operation = {
    id: "43",
    trkorr: "TRDK924752",
    targetSystem: "DEV_AIX",
    status: "running",
    phase: "verifying"
  } as any;
  await service!.runReleaseOperation("43", {
    claim: async () => operation,
    update: async (_id: string, patch: any) => { terminal.push(patch); return { ...operation, ...patch }; },
    updateSync: async () => operation,
    execute: async () => ({
      ok: false,
      message: "PARTIAL_RELEASE_TASK_FAILED",
      mode: "RELEASE",
      trkorr: operation.trkorr,
      targetSystem: operation.targetSystem,
      targetServer: "TRD",
      hasErrors: true,
      hasWarnings: false,
      tasks: [{ trkorr: "TRDK924753", status: "ERROR", message: "Release failed RC 7", objects: [] }]
    }),
    sync: async () => ({ ok: true, requestCount: 0 }),
    schedule: () => {}
  });
  assert.equal(terminal[0].status, "failed");
  assert.equal(terminal[0].result.tasks[0].message, "Release failed RC 7");

  terminal.length = 0;
  await service!.runReleaseOperation("43", {
    claim: async () => operation,
    update: async (_id: string, patch: any) => { terminal.push(patch); return { ...operation, ...patch }; },
    updateSync: async () => operation,
    execute: async () => { throw new Error("SAP_CR_RELEASE_TIMEOUT"); },
    sync: async () => ({ ok: true, requestCount: 0 }),
    schedule: () => {}
  });
  assert.equal(terminal[0].status, "timed_out");
  assert.equal(terminal[0].message, "SAP_CR_RELEASE_TIMEOUT");
});

test("runReleaseSync records sync failure without changing release status", async () => {
  const service = await import("../src/server/sap/transportReleaseOperationService.js").catch(() => null);
  assert.equal(typeof service?.runReleaseSync, "function");
  const syncStates: string[] = [];

  await service!.runReleaseSync("42", {
    updateSync: async (_id: string, status: string) => { syncStates.push(status); return {} as any; },
    sync: async () => { throw new Error("QA unavailable"); }
  });

  assert.deepEqual(syncStates, ["running", "failed"]);
});

test("release router exposes operation start and status endpoints", async () => {
  const routes = await import("../src/server/routes/transportReleaseRoutes.js");
  const registered = (routes.transportReleaseRoutes as any).stack
    .filter((layer: any) => layer.route)
    .flatMap((layer: any) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));

  assert.ok(registered.includes("POST /operations"));
  assert.ok(registered.includes("GET /operations/:id"));
});

test("startReleaseOperation does not schedule a duplicate active operation", async () => {
  const service = await import("../src/server/sap/transportReleaseOperationService.js");
  let scheduled = 0;
  const active = {
    id: "42",
    trkorr: "TRDK924752",
    targetSystem: "DEV_AIX",
    status: "running",
    phase: "verifying",
    message: "Waiting for SAP confirmation",
    result: null,
    syncStatus: "not_queued",
    syncMessage: null,
    createdAt: "",
    startedAt: "",
    finishedAt: null,
    updatedAt: ""
  } as any;

  const returned = await service.startReleaseOperation({ trkorr: active.trkorr, targetSystem: active.targetSystem }, {
    createOrGet: async () => active,
    claim: async () => null,
    update: async () => active,
    updateSync: async () => active,
    execute: async () => { throw new Error("must not run"); },
    sync: async () => ({}),
    schedule: () => { scheduled += 1; }
  });

  assert.equal(returned.id, "42");
  assert.equal(scheduled, 0);
});
