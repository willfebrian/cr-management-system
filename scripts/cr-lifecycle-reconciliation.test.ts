import assert from "node:assert/strict";
import test from "node:test";
import type { LegacyTransportLifecycleCandidate } from "../src/server/db/crRepository.js";
import {
  reconcileLegacyTransportLifecycle,
  type TransportLifecycleReconciliationDependencies
} from "../src/server/sync/transportLifecycleReconciler.js";

function candidate(targetSystemCode: "QA" | "PRD"): LegacyTransportLifecycleCandidate {
  return {
    trkorr: "TRDK924576",
    target_system_code: targetSystemCode,
    transport_step: "U"
  };
}

function dependencies(overrides: Partial<TransportLifecycleReconciliationDependencies> = {}) {
  const writes: string[] = [];
  let validated = 0;
  const value: TransportLifecycleReconciliationDependencies = {
    listCandidates: async (target) => [candidate(target)],
    readLogsByRequest: async ({ targetSystemCode }) => targetSystemCode === "QA"
      ? [{ trkorr: "TRDK924576", step: "I", timestamp: "20260623163304", returnCode: "0000" }]
      : [],
    upsertConfirmed: async (target, logs) => {
      writes.push(`confirm:${target}:${logs[0]?.trkorr}`);
      return { processed: 1, orphanLogs: [], rejectedLogs: [] };
    },
    downgrade: async (target, trkorr) => {
      writes.push(`downgrade:${target}:${trkorr}`);
      return true;
    },
    countUnresolved: async () => 0,
    validateConstraint: async () => {
      validated += 1;
    },
    ...overrides
  };
  return { value, writes, validated: () => validated };
}

test("keeps QA imported and downgrades PRD when only QA has step I", async () => {
  const deps = dependencies();

  const result = await reconcileLegacyTransportLifecycle(
    { targetSystemCodes: ["QA", "PRD"], limitPerTarget: 50 },
    deps.value
  );

  assert.deepEqual(result.targets.map((row) => ({
    target: row.targetSystemCode,
    candidates: row.candidates,
    confirmed: row.confirmed,
    downgraded: row.downgraded,
    failed: row.failed
  })), [
    { target: "QA", candidates: 1, confirmed: 1, downgraded: 0, failed: 0 },
    { target: "PRD", candidates: 1, confirmed: 0, downgraded: 1, failed: 0 }
  ]);
  assert.deepEqual(deps.writes, [
    "confirm:QA:TRDK924576",
    "downgrade:PRD:TRDK924576"
  ]);
  assert.equal(result.constraintValidated, true);
  assert.equal(deps.validated(), 1);
});

test("preserves unresolved legacy evidence when SAP throws", async () => {
  const deps = dependencies({
    listCandidates: async () => [candidate("PRD")],
    readLogsByRequest: async () => {
      throw new Error("SAP unavailable");
    },
    countUnresolved: async () => 1
  });

  const result = await reconcileLegacyTransportLifecycle(
    { targetSystemCodes: ["PRD"], limitPerTarget: 50 },
    deps.value
  );

  assert.equal(result.targets[0]?.failed, 1);
  assert.equal(result.targets[0]?.decisions[0]?.action, "failed");
  assert.deepEqual(deps.writes, []);
  assert.equal(result.constraintValidated, false);
  assert.equal(deps.validated(), 0);
});

test("does not recheck valid historical step-I rows", async () => {
  let reads = 0;
  const deps = dependencies({
    listCandidates: async () => [],
    readLogsByRequest: async () => {
      reads += 1;
      return [];
    }
  });

  const result = await reconcileLegacyTransportLifecycle(
    { targetSystemCodes: ["QA", "PRD"], limitPerTarget: 50 },
    deps.value
  );

  assert.equal(reads, 0);
  assert.deepEqual(result.targets.map((row) => row.candidates), [0, 0]);
  assert.equal(result.constraintValidated, true);
});

test("dry-run reports decisions without mutating lifecycle rows", async () => {
  const deps = dependencies();

  const result = await reconcileLegacyTransportLifecycle(
    { targetSystemCodes: ["QA", "PRD"], limitPerTarget: 50, dryRun: true },
    deps.value
  );

  assert.deepEqual(result.targets.flatMap((row) => row.decisions.map((decision) => decision.action)), [
    "confirm",
    "downgrade"
  ]);
  assert.deepEqual(deps.writes, []);
  assert.equal(deps.validated(), 0);
  assert.equal(result.constraintValidated, false);
});
