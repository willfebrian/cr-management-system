import assert from "node:assert/strict";
import test from "node:test";
import { shouldQueueTransportCreateSync, transportCreateSyncOptions } from "../src/server/sync/transportRequestSync.js";
import { normalizeTargetSystem } from "../src/server/sap/transportRequestService.js";

test("queues automatic sync only after a successful DEV AIX request", () => {
  assert.equal(shouldQueueTransportCreateSync("DEV_AIX", { ok: true, request: "TRDK999001" }), true);
  assert.equal(shouldQueueTransportCreateSync("DEV_NC", { ok: true, request: "TRDK999001" }), false);
  assert.equal(shouldQueueTransportCreateSync("DEV_AIX", { ok: false, request: "TRDK999001" }), false);
  assert.equal(shouldQueueTransportCreateSync("DEV_AIX", { ok: true, request: "" }), false);
});

test("automatic sync uses the fixed DEV, QA, PRD incremental three-day scope", () => {
  assert.deepEqual(transportCreateSyncOptions(), {
    systemCodes: ["DEV", "QA", "PRD"],
    syncMode: "incremental",
    lookbackDays: 3,
    rowCount: 5000
  });
});

test("backend rejects an unsupported target instead of silently redirecting it", () => {
  assert.equal(normalizeTargetSystem("DEV_AIX"), "DEV_AIX");
  assert.throws(() => normalizeTargetSystem("SAP_DEV_SANDBOX_140"), /TARGET_SYSTEM_NOT_ALLOWED/);
});
