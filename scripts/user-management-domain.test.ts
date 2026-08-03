import assert from "node:assert/strict";
import test from "node:test";
import {
  assertArchiveAllowed,
  assertInitialPassword,
  assertRoleChangeAllowed,
  assertStatusChangeAllowed,
  assertUsernameChangeAllowed,
  normalizeManagedUsername,
  UserManagementError
} from "../src/server/users/userManagementDomain";

const actor = { id: 7, username: "ADMIN7", role: "ADMIN" as const };
const adminTarget = {
  id: 8,
  username: "ADMIN8",
  role: "ADMIN" as const,
  isActive: true,
  deletedAt: null
};

test("normalizes usernames case-insensitively and rejects an empty username", () => {
  assert.equal(normalizeManagedUsername("  mixed.Case-1  "), "MIXED.CASE-1");
  assert.throws(() => normalizeManagedUsername("   "), UserManagementError);
});

test("requires an initial password of at least eight characters", () => {
  assert.throws(() => assertInitialPassword("short"), UserManagementError);
  assert.doesNotThrow(() => assertInitialPassword("long-enough"));
});

test("allows an administrator to rename their own stable account", () => {
  assert.doesNotThrow(() =>
    assertUsernameChangeAllowed(
      { ...adminTarget, id: actor.id, username: actor.username },
      actor,
      "RENAMED7"
    )
  );
});

test("blocks self-demotion, self-deactivation, and self-archive", () => {
  const self = { ...adminTarget, id: actor.id, username: actor.username };
  assert.throws(() => assertRoleChangeAllowed(self, actor, 2, "USER"), UserManagementError);
  assert.throws(() => assertStatusChangeAllowed(self, actor, 2, false), UserManagementError);
  assert.throws(() => assertArchiveAllowed(self, actor, 2), UserManagementError);
});

test("protects the final active non-archived administrator", () => {
  assert.throws(() => assertRoleChangeAllowed(adminTarget, actor, 1, "USER"), UserManagementError);
  assert.throws(() => assertStatusChangeAllowed(adminTarget, actor, 1, false), UserManagementError);
  assert.throws(() => assertArchiveAllowed(adminTarget, actor, 1), UserManagementError);
});

test("allows changing a different administrator when another active administrator remains", () => {
  assert.doesNotThrow(() => assertRoleChangeAllowed(adminTarget, actor, 2, "USER"));
  assert.doesNotThrow(() => assertStatusChangeAllowed(adminTarget, actor, 2, false));
  assert.doesNotThrow(() => assertArchiveAllowed(adminTarget, actor, 2));
});
