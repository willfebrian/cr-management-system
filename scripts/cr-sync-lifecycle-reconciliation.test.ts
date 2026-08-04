import assert from "node:assert/strict";
import test from "node:test";
import { runLifecycleReconciliationForSync } from "../src/server/sync/crSyncRunner.js";

test("full-period sync reconciles only selected QA and PRD targets", async () => {
  const calls: unknown[] = [];
  const results = await runLifecycleReconciliationForSync(
    { syncMode: "full_period", systemCodes: ["DEV", "QA", "PRD"], limitPerTarget: 25 },
    async (options) => {
      calls.push(options);
      return {
        dryRun: false,
        constraintValidated: true,
        targets: [
          { targetSystemCode: "QA" as const, candidates: 2, confirmed: 2, downgraded: 0, failed: 0, decisions: [] },
          { targetSystemCode: "PRD" as const, candidates: 3, confirmed: 1, downgraded: 1, failed: 1, decisions: [] }
        ]
      };
    }
  );

  assert.deepEqual(calls, [{ targetSystemCodes: ["QA", "PRD"], limitPerTarget: 25 }]);
  assert.deepEqual(results, [
    {
      targetSystemCode: "QA",
      evidenceSource: "confirmed",
      legacyCandidates: 2,
      legacyConfirmed: 2,
      legacyDowngraded: 0,
      reconciliationFailures: 0,
      constraintValidated: true
    },
    {
      targetSystemCode: "PRD",
      evidenceSource: "confirmed",
      legacyCandidates: 3,
      legacyConfirmed: 1,
      legacyDowngraded: 1,
      reconciliationFailures: 1,
      constraintValidated: true
    }
  ]);
});

test("incremental sync does not audit historical lifecycle rows", async () => {
  let called = false;
  const results = await runLifecycleReconciliationForSync(
    { syncMode: "incremental", systemCodes: ["QA", "PRD"], limitPerTarget: 25 },
    async () => {
      called = true;
      throw new Error("must not run");
    }
  );

  assert.equal(called, false);
  assert.deepEqual(results, []);
});

test("full-period reconciliation ignores DEV and keeps the successful target summary", async () => {
  const results = await runLifecycleReconciliationForSync(
    { syncMode: "full_period", systemCodes: ["DEV", "QA"], limitPerTarget: 10 },
    async () => ({
      dryRun: false,
      constraintValidated: false,
      targets: [
        { targetSystemCode: "QA" as const, candidates: 1, confirmed: 0, downgraded: 0, failed: 1, decisions: [] }
      ]
    })
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.targetSystemCode, "QA");
  assert.equal(results[0]?.reconciliationFailures, 1);
});
