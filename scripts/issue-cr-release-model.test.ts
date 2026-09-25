import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIssueReleaseCandidates,
  didIssueReleaseSelectionChange,
  getChangeIssueReleaseCandidates,
  hasPendingIssueReleases,
  isIssueReleaseReady,
  normalizeIssueReleaseLifecycle
} from "../src/client/components/crTransport/issueReleaseModel.js";

test("linked Created and Outstanding CRs are eligible for Issue release", () => {
  const candidates = buildIssueReleaseCandidates([
    { sap_system_code: "DEV", trkorr: "TRDK924682", lifecycle_status: "Created", cr_description_snapshot: "First" },
    { sap_system_code: "DEV", trkorr: "TRDK924683", lifecycle_status: "Released", cr_description_snapshot: "Second" },
    { sap_system_code: "DEV_NC", trkorr: "NCDK900001", lifecycle_status: "created", cr_description_snapshot: "Third" },
    { sap_system_code: "DEV", trkorr: "TRDK924684", lifecycle_status: "outstanding", cr_description_snapshot: "Open request" },
    { sap_system_code: "DEV", trkorr: "TRDK924685", status_group: "outstanding", cr_description_snapshot: "Unknown lifecycle" }
  ]);

  assert.deepEqual(candidates.map((candidate) => ({
    trkorr: candidate.trkorr,
    targetSystem: candidate.targetSystem,
    description: candidate.description
  })), [
    { trkorr: "TRDK924682", targetSystem: "DEV_AIX", description: "First" },
    { trkorr: "NCDK900001", targetSystem: "DEV_NC", description: "Third" },
    { trkorr: "TRDK924684", targetSystem: "DEV_AIX", description: "Open request" }
  ]);
});

test("normalizes an open SAP transport to the Created lifecycle shown in Change Issue", () => {
  assert.equal(normalizeIssueReleaseLifecycle("outstanding"), "created");
  assert.equal(normalizeIssueReleaseLifecycle("released"), "released");
});

test("selection changes invalidate prior Test Run results regardless of item order", () => {
  assert.equal(didIssueReleaseSelectionChange(["TRDK924682"], ["TRDK924682"]), false);
  assert.equal(didIssueReleaseSelectionChange(["TRDK924682", "TRDK924730"], ["TRDK924730", "TRDK924682"]), false);
  assert.equal(didIssueReleaseSelectionChange(["TRDK924682", "TRDK924730"], ["TRDK924682"]), true);
});

test("Release is available only after every selected CR passes its current Test Run", () => {
  assert.equal(isIssueReleaseReady([], {}), false);
  assert.equal(isIssueReleaseReady(["TRDK924682", "TRDK924730"], {
    TRDK924682: { ok: true, hasErrors: false },
    TRDK924730: { ok: true, hasErrors: false }
  }), true);
  assert.equal(isIssueReleaseReady(["TRDK924682", "TRDK924730"], {
    TRDK924682: { ok: true, hasErrors: false },
    TRDK924730: { ok: false, hasErrors: true }
  }), false);
  assert.equal(isIssueReleaseReady(["TRDK924682", "TRDK924730"], {
    TRDK924682: { ok: true, hasErrors: false }
  }), false);
});

test("hides the Release action only after every selected CR is confirmed released", () => {
  assert.equal(hasPendingIssueReleases(["TRDK924682"], {}), true);
  assert.equal(hasPendingIssueReleases(["TRDK924682"], {
    TRDK924682: { ok: true }
  }), false);
  assert.equal(hasPendingIssueReleases(["TRDK924682", "TRDK924730"], {
    TRDK924682: { ok: true },
    TRDK924730: { ok: false }
  }), true);
});

test("the Release CR entry is available only in Change Issue with a Created linked CR", () => {
  const links = [
    { sap_system_code: "DEV", trkorr: "TRDK924682", lifecycle_status: "Created" },
    { sap_system_code: "DEV", trkorr: "TRDK924683", lifecycle_status: "Released" }
  ];

  assert.deepEqual(getChangeIssueReleaseCandidates("create", links), []);
  assert.deepEqual(
    getChangeIssueReleaseCandidates("change", links).map((candidate) => candidate.trkorr),
    ["TRDK924682"]
  );
});
