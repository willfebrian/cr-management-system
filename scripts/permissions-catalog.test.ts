import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PRESET,
  REGULAR_USER_PRESET,
  hasPermission,
  normalizePermissions
} from "../src/shared/permissions";

test("presetsOmitTransportMutations", () => {
  for (const preset of [ADMIN_PRESET, REGULAR_USER_PRESET]) {
    assert.equal(preset.includes("transport.create"), false);
    assert.equal(preset.includes("transport.release"), false);
  }
});

test("referencePresetsMatchRole", () => {
  assert.equal(REGULAR_USER_PRESET.includes("issue.helpdesk_references"), true);
  assert.equal(ADMIN_PRESET.includes("issue.helpdesk_references"), true);
  assert.equal(REGULAR_USER_PRESET.includes("issue.cr_references"), false);
  assert.equal(REGULAR_USER_PRESET.includes("issue.glpi_references"), false);
  assert.equal(ADMIN_PRESET.includes("issue.cr_references"), true);
  assert.equal(ADMIN_PRESET.includes("issue.glpi_references"), true);
});

test("issueOutputGrantsAreIndependent", () => {
  const keys = normalizePermissions(["issue.generate_email"], "USER");
  assert.equal(hasPermission(keys, "issue.generate_email"), true);
  assert.equal(hasPermission(keys, "issue.generate_glpi_template"), false);
  assert.equal(hasPermission(keys, "issue.reminder"), false);
  const glpiKeys = normalizePermissions(["issue.create_glpi_ticket"], "USER");
  assert.equal(hasPermission(glpiKeys, "issue.generate_glpi_template"), true);
});

test("dependentIssueActionAddsView", () => {
  assert.deepEqual(normalizePermissions(["issue.edit"], "USER"), ["issue.view", "issue.edit"]);
});

test("transportActionsAreIndependent", () => {
  const keys = normalizePermissions(["transport.create"], "USER");
  assert.equal(hasPermission(keys, "transport.create"), true);
  assert.equal(hasPermission(keys, "transport.release"), false);
  assert.equal(hasPermission(keys, "transport.view"), false);
});

test("userCannotHoldManagementGrant", () => {
  assert.throws(() => normalizePermissions(["users.manage"], "USER"));
  assert.throws(() => normalizePermissions(["issue.cr_references"], "USER"));
  assert.throws(() => normalizePermissions(["issue.glpi_references"], "USER"));
});

test("unknownPermissionIsRejected", () => {
  assert.throws(() => normalizePermissions(["issue.unknown"], "ADMIN"));
});
