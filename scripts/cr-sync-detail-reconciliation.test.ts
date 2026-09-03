import assert from "node:assert/strict";
import test from "node:test";
import * as syncRunner from "../src/server/sync/crSyncRunner.js";

test("incremental sync reconciles CR detail when the parent header signature is unchanged", () => {
  const shouldRefreshDetail = (syncRunner as typeof syncRunner & {
    shouldRefreshDetail?: (
      signature: Record<string, string | number | null>,
      request: Record<string, string>
    ) => boolean;
  }).shouldRefreshDetail;

  assert.equal(typeof shouldRefreshDetail, "function");
  assert.equal(shouldRefreshDetail!(
    {
      status_code: "D",
      status_group: "outstanding",
      changed_date: "20260803",
      changed_time: "164234",
      task_count: 1,
      object_count: 7
    },
    {
      status: "D",
      statusGroup: "outstanding",
      changedDate: "20260803",
      changedTime: "164234"
    }
  ), true);
});

test("incremental sync refreshes a parent when only its child task changed in the selected period", () => {
  const resolveScopedParentRequests = (syncRunner as typeof syncRunner & {
    resolveScopedParentRequests?: (rows: Array<Record<string, string>>, owner: string) => Array<Record<string, string>>;
  }).resolveScopedParentRequests;

  assert.equal(typeof resolveScopedParentRequests, "function");
  assert.deepEqual(resolveScopedParentRequests!([
    {
      trkorr: "TRDK924731",
      parentRequest: "TRDK924730",
      owner: "TRSTDEV",
      changedDate: "20260903",
      changedTime: "154038"
    }
  ], "TRSTDEV"), [
    {
      trkorr: "TRDK924730",
      parentRequest: "",
      owner: "TRSTDEV",
      changedDate: "20260903",
      changedTime: "154038"
    }
  ]);
});
