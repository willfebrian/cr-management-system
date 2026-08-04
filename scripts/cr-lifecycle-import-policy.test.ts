import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeLatestConfirmedImportLogs,
  isConfirmedImportLog,
  normalizeTransportStep
} from "../src/server/sync/transportLifecyclePolicy.js";

test("accepts only normalized TPALOG import steps", () => {
  assert.equal(normalizeTransportStep(" i "), "I");
  assert.equal(isConfirmedImportLog({ trkorr: "TRDK924576", step: " I " }), true);
  assert.equal(isConfirmedImportLog({ trkorr: "TRDK924576", step: "U" }), false);
  assert.equal(isConfirmedImportLog({ trkorr: "TRDK924576" }), false);
  assert.equal(isConfirmedImportLog({ trkorr: "INVALID", step: "I" }), false);
});

test("never falls back to a non-import step", () => {
  const result = dedupeLatestConfirmedImportLogs([
    { trkorr: "TRDK924576", step: "U", timestamp: "20260624122022" },
    { trkorr: "TRDK924576", step: "I", timestamp: "20260623163304" },
    { trkorr: "TRDK924580", step: "U", timestamp: "20260625120000" }
  ]);

  assert.deepEqual(result.accepted.map((row) => [row.trkorr, row.step]), [["TRDK924576", "I"]]);
  assert.deepEqual(result.rejected.map((row) => [row.trkorr, row.step]), [
    ["TRDK924576", "U"],
    ["TRDK924580", "U"]
  ]);
});

test("keeps only the latest valid import per request", () => {
  const result = dedupeLatestConfirmedImportLogs([
    { trkorr: "TRDK924576", step: "I", timestamp: "20260623163304" },
    { trkorr: "trdk924576", step: " i ", timestamp: "20260624110000" }
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.trkorr, "TRDK924576");
  assert.equal(result.accepted[0]?.step, "I");
  assert.equal(result.accepted[0]?.timestamp, "20260624110000");
});

test("keeps a successful import when a later retry fails", () => {
  const result = dedupeLatestConfirmedImportLogs([
    {
      trkorr: "TRDK907763",
      step: "I",
      timestamp: "20160104162856",
      returnCode: "0000"
    },
    {
      trkorr: "TRDK907763",
      step: "I",
      timestamp: "20160105084724",
      returnCode: "0016"
    }
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.timestamp, "20160104162856");
  assert.equal(result.accepted[0]?.returnCode, "0000");
});

test("keeps the latest failed attempt when no import ever succeeded", () => {
  const result = dedupeLatestConfirmedImportLogs([
    { trkorr: "TRDK907765", step: "I", timestamp: "20160104120000", returnCode: "0008" },
    { trkorr: "TRDK907765", step: "I", timestamp: "20160104130000", returnCode: "0016" }
  ]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.timestamp, "20160104130000");
  assert.equal(result.accepted[0]?.returnCode, "0016");
});
