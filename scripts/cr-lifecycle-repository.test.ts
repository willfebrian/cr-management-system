import assert from "node:assert/strict";
import test from "node:test";
import {
  countLegacyTransportLifecycleCandidates,
  downgradeLegacyTransportLifecycle,
  listLegacyTransportLifecycleCandidates,
  refreshTransportLifecycleFromCache,
  validateConfirmedTransportStepConstraint
} from "../src/server/db/crRepository.js";

type QueryCall = { text: string; values?: unknown[] };

function fakeDatabase(results: Array<{ rows?: unknown[]; rowCount?: number }> = []) {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: async (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      const next = results.shift() || {};
      return { rows: next.rows || [], rowCount: next.rowCount || 0 };
    }
  };
}

test("refresh creates pending placeholders without inferred imports", async () => {
  const db = fakeDatabase();

  await refreshTransportLifecycleFromCache("DEV", db);

  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.values), [["DEV", "QA"], ["DEV", "PRD"]]);
  for (const call of db.calls) {
    assert.match(call.text, /'pending'/i);
    assert.match(call.text, /'unknown'/i);
    assert.doesNotMatch(call.text, /ELSE\s+'imported'/i);
    assert.match(call.text, /transport_step\s+IS\s+DISTINCT\s+FROM\s+'I'/i);
  }
});

test("lists every imported lifecycle row without confirmed step-I evidence", async () => {
  const candidate = {
    trkorr: "TRDK924576",
    target_system_code: "PRD",
    transport_step: "U"
  };
  const db = fakeDatabase([{ rows: [candidate] }]);

  const rows = await listLegacyTransportLifecycleCandidates("PRD", 25, db);

  assert.deepEqual(rows, [candidate]);
  assert.deepEqual(db.calls[0]?.values, ["PRD", 25]);
  assert.match(db.calls[0]?.text || "", /evidence_source\s+IS\s+DISTINCT\s+FROM\s+'confirmed'/i);
  assert.match(db.calls[0]?.text || "", /transport_step\s+IS\s+DISTINCT\s+FROM\s+'I'/i);
  assert.match(db.calls[0]?.text || "", /lifecycle\.trkorr\s+DESC/i);
});

test("downgrade clears stale import evidence and returns whether a row changed", async () => {
  const db = fakeDatabase([{ rowCount: 1 }]);

  const changed = await downgradeLegacyTransportLifecycle(
    "PRD",
    "TRDK924576",
    "No valid TPALOG step I found during reconciliation.",
    db
  );

  assert.equal(changed, true);
  assert.deepEqual(db.calls[0]?.values, [
    "PRD",
    "TRDK924576",
    "No valid TPALOG step I found during reconciliation."
  ]);
  assert.match(db.calls[0]?.text || "", /transport_status\s*=\s*'pending'/i);
  assert.match(db.calls[0]?.text || "", /evidence_source\s*=\s*'unknown'/i);
  assert.match(db.calls[0]?.text || "", /imported_at\s*=\s*NULL/i);
  assert.match(db.calls[0]?.text || "", /return_code\s*=\s*NULL/i);
});

test("counts unresolved legacy rows before validating the database constraint", async () => {
  const countDb = fakeDatabase([{ rows: [{ total: 0 }] }]);
  assert.equal(await countLegacyTransportLifecycleCandidates(countDb), 0);

  const validateDb = fakeDatabase();
  await validateConfirmedTransportStepConstraint(validateDb);
  assert.match(
    validateDb.calls[0]?.text || "",
    /VALIDATE CONSTRAINT chk_cr_transport_lifecycle_confirmed_step/i
  );
});
