import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTransportTarget, transportTargetLabel } from "../src/client/components/crTransport/transportTarget.js";
import { getCreatedCrPreview, getTransportCreateState } from "../src/client/components/crTransport/CrTransportCreate.js";

test("marks selected objects as assigned after SAP CR creation", () => {
  const state = getTransportCreateState({
    created: { ok: true, message: "REQUEST_CREATED", request: "TRDK921778", task: "TRDK921779" },
    selected: true
  });

  assert.deepEqual(state, {
    assigned: true,
    request: "TRDK921778",
    canCreate: false,
    createLabel: "CR already created"
  });
});

test("keeps create action unavailable while an object is already locked in SAP", () => {
  const state = getTransportCreateState({
    created: null,
    locked: true,
    lockOrder: "TRDK921778"
  });

  assert.equal(state.assigned, true);
  assert.equal(state.request, "TRDK921778");
  assert.equal(state.canCreate, false);
});

test("exposes synced CR metadata for an Issue preview immediately after creation", () => {
  assert.deepEqual(getCreatedCrPreview({
    ok: true,
    message: "REQUEST_CREATED",
    request: "TRDK924760",
    syncCompleted: true,
    cr: {
      trkorr: "TRDK924760",
      description: "AB - Update ZQM039 case batch digit validation",
      statusGroup: "modifiable",
      sapSystemCode: "DEV"
    }
  }), {
    description: "AB - Update ZQM039 case batch digit validation",
    status: "modifiable",
    system: "DEV"
  });
});

test("uses English neutral guidance in the create transport form", () => {
  const source = readFileSync(new URL("../src/client/components/crTransport/CrTransportCreate.tsx", import.meta.url), "utf8");

  assert.match(source, />SAP Object</);
  assert.match(source, /placeholder="Search by technical name or TCode"/);
  assert.match(source, />Request Description</);
  assert.match(source, /placeholder="Describe the requested change"/);
  assert.doesNotMatch(source, /Contoh: ZZKMK|Update ZZKMK case add new validation/);
});

test("normalizes only supported transport targets", () => {
  assert.equal(normalizeTransportTarget("DEV_AIX"), "DEV_AIX");
  assert.equal(normalizeTransportTarget("DEV_NC"), "DEV_NC");
  assert.equal(normalizeTransportTarget("unknown"), "DEV_NC");
  assert.equal(transportTargetLabel("DEV_AIX"), "DEV AIX");
});
