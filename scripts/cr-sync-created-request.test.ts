import assert from "node:assert/strict";
import test from "node:test";
import { syncCreatedTransportRequest } from "../src/server/sync/crSyncRunner.js";

test("syncs only the newly created request, its child task, and its objects into SQL", async () => {
  const persistedHeaders: string[] = [];
  const snapshots: string[] = [];
  const finished: Array<[number, string, string | null, number]> = [];
  const detail = {
    ok: true,
    server: "SAP_DEV_AIX",
    trkorr: "TRDK999003",
    header: { trkorr: "TRDK999003", statusGroup: "outstanding", owner: "TRSTDEV" },
    tasks: [{ trkorr: "TRDK999004", parentRequest: "TRDK999003", statusGroup: "modifiable", owner: "TRSTDEV" }],
    counts: { taskCount: 1, objectCount: 1, keyCount: 0 },
    objectGroups: [{ trkorr: "TRDK999004", objectCount: 1, keyCount: 0, objects: [{ trkorr: "TRDK999004", position: "000001", pgmid: "R3TR", objectType: "PROG", objectName: "ZTEST" }], keys: [] }]
  };

  const result = await syncCreatedTransportRequest("TRDK999003", "DEV", {
    getSystem: () => ({ code: "DEV", server: "SAP_DEV_AIX", owner: "TRSTDEV", days: 30, enabled: true }),
    now: () => new Date("2026-08-21T00:00:00.000Z"),
    createSyncRun: async () => 71,
    readCrDetail: async () => detail,
    upsertCrHeader: async (header: any) => { persistedHeaders.push(header.trkorr); },
    insertCrStatusSnapshot: async (header: any) => { snapshots.push(header.trkorr); },
    replaceCrObjects: async (receivedDetail: any) => { assert.equal(receivedDetail, detail); },
    finishSyncRun: async (...args: [number, string, string | null, number]) => { finished.push(args); }
  });

  assert.deepEqual(result, { ok: true, trkorr: "TRDK999003", syncRunId: 71 });
  assert.deepEqual(persistedHeaders, ["TRDK999003", "TRDK999004"]);
  assert.deepEqual(snapshots, ["TRDK999003", "TRDK999004"]);
  assert.deepEqual(finished, [[71, "success", null, 1]]);
});
