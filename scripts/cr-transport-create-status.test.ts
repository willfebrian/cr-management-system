import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTransportCreateState } from "../src/client/components/crTransport/CrTransportCreate.js";

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

test("uses English neutral guidance in the create transport form", () => {
  const source = readFileSync(new URL("../src/client/components/crTransport/CrTransportCreate.tsx", import.meta.url), "utf8");

  assert.match(source, />SAP Object</);
  assert.match(source, /placeholder="Search by technical name or TCode"/);
  assert.match(source, />Request Description</);
  assert.match(source, /placeholder="Describe the requested change"/);
  assert.doesNotMatch(source, /Contoh: ZZKMK|Update ZZKMK case add new validation/);
});
