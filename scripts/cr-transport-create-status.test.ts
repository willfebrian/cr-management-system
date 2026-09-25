import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTransportTarget, transportTargetLabel } from "../src/client/components/crTransport/transportTarget.js";
import * as createModule from "../src/client/components/crTransport/CrTransportCreate.js";

const { getCreatedCrPreview, getResolvedObjectHint, getTransportCreateState } = createModule;

test("marks selected objects as assigned after SAP CR creation", () => {
  const state = getTransportCreateState({
    created: { ok: true, message: "REQUEST_CREATED", request: "TRDK921778", task: "TRDK921779" },
    selected: true
  });

  assert.deepEqual(state, {
    assigned: true,
    request: "TRDK921778",
    assignmentKind: "created",
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
  assert.equal(state.assignmentKind, "existing");
  assert.equal(state.canCreate, false);
});

test("prevents a new CR when SAP reports a lock without a request number", () => {
  const state = getTransportCreateState({ created: null, locked: true, lockOrder: "" });

  assert.equal(state.assigned, false);
  assert.equal(state.canCreate, false);
});

test("identifies the matching SAP request after a preflight lock race", () => {
  const getLockedObjectConflict = (createModule as typeof createModule & { getLockedObjectConflict?: (...args: unknown[]) => unknown }).getLockedObjectConflict;
  assert.equal(typeof getLockedObjectConflict, "function");
  const selected = [{ pgmid: "LIMU", objectType: "FUNC", objectName: "ZFI_GL_DL", sourcePackage: "ZTRD", targetPackage: "ZTRD" as const, locked: false, lockOrder: "", lockUser: "" }];
  const refreshed = [[{ ...selected[0], locked: true, lockOrder: "TRDK924831", lockUser: "TRSTDEV" }]];

  assert.deepEqual(getLockedObjectConflict!(selected, refreshed), {
    objectName: "ZFI_GL_DL",
    request: "TRDK924831"
  });
});

test("links an existing CR to an Issue without replacing other linked CRs", () => {
  const appendExistingCrLink = (createModule as typeof createModule & { appendExistingCrLink?: (links: string, request: string) => string }).appendExistingCrLink;
  assert.equal(typeof appendExistingCrLink, "function");
  assert.equal(appendExistingCrLink!("TRDK924730; TRDK924682", "TRDK924831"), "TRDK924730; TRDK924682; TRDK924831");
  assert.equal(appendExistingCrLink!("TRDK924831", "trdk924831"), "TRDK924831");
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

test("explains when SAP resolves a searched function module to its transport root", () => {
  assert.equal(getResolvedObjectHint("ZMM_MD_DL", {
    pgmid: "R3TR",
    objectType: "FUGR",
    objectName: "ZMM_MD",
    sourcePackage: "ZTRD",
    targetPackage: "ZTRD",
    locked: false,
    lockOrder: "",
    lockUser: ""
  }), "ZMM_MD_DL resolves to transport root ZMM_MD (Function Group).");
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
