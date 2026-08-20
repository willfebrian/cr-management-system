import assert from "node:assert/strict";
import test from "node:test";
import { findDueAutoSyncSystems, resolveSystemIntervalMinutes } from "../src/server/sync/crAutoSyncScheduler.js";

test("auto sync selects DEV and QA independently while leaving unconfigured PRD manual", async () => {
  const nowMs = Date.parse("2026-08-20T10:30:00.000Z");
  const lastSuccessfulAt: Record<string, string> = {
    DEV: "2026-08-20T10:19:00.000Z",
    QA: "2026-08-20T10:09:00.000Z",
    PRD: "2026-08-19T00:00:00.000Z"
  };

  const due = await findDueAutoSyncSystems({
    systemCodes: ["DEV", "QA"],
    defaultIntervalMinutes: 60,
    intervalMinutesBySystem: { DEV: 10, QA: 20, PRD: 30 },
    nowMs,
    getLastSuccessfulAt: async (systemCode) => lastSuccessfulAt[systemCode] || null
  });

  assert.deepEqual(due, ["DEV", "QA"]);
});

test("auto sync waits until each system-specific interval has elapsed", async () => {
  const nowMs = Date.parse("2026-08-20T10:30:00.000Z");
  const due = await findDueAutoSyncSystems({
    systemCodes: ["DEV", "QA"],
    defaultIntervalMinutes: 60,
    intervalMinutesBySystem: { DEV: 10, QA: 20 },
    nowMs,
    getLastSuccessfulAt: async (systemCode) => systemCode === "DEV"
      ? "2026-08-20T10:21:00.000Z"
      : "2026-08-20T10:11:00.000Z"
  });

  assert.deepEqual(due, []);
});

test("system interval falls back to the global interval and enforces the five-minute minimum", () => {
  assert.equal(resolveSystemIntervalMinutes("DEV", 60, { DEV: 10 }), 10);
  assert.equal(resolveSystemIntervalMinutes("QA", 60, { DEV: 10 }), 60);
  assert.equal(resolveSystemIntervalMinutes("DEV", 60, { DEV: 2 }), 5);
});
