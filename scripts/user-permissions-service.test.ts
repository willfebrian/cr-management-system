import assert from "node:assert/strict";
import test from "node:test";
import { createUserManagementService } from "../src/server/users/userManagementService";

const actor = { id: 1, username: "ROOT", role: "ADMIN" as const, permissions: ["users.manage"] };
const baseUser = {
  id: 2, username: "ALICE", role: "USER", is_active: true,
  must_change_password: false, last_login_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null, deleted_by_snapshot: null, delete_reason: null, person_id: null
};

function database(target = baseUser, grants = ["issue.view"], managers = 1) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let current = [...grants];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FOR UPDATE/i.test(sql) && /FROM app_users u/i.test(sql)) return { rows: [{ ...target, permissions: current }] };
    if (/active_admin_count/i.test(sql)) return { rows: [{ active_admin_count: String(managers) }] };
    if (/^SELECT permission_key FROM app_user_permissions/i.test(sql)) return { rows: current.map((permission_key) => ({ permission_key })) };
    if (/DELETE FROM app_user_permissions/i.test(sql)) { current = []; return { rows: [] }; }
    if (/INSERT INTO app_user_permissions/i.test(sql)) { current = [...(params[1] as string[])]; return { rows: [] }; }
    if (/FROM app_users u/i.test(sql) && /WHERE u.id = \$1/i.test(sql)) return { rows: [{ ...target, permissions: current }] };
    return { rows: [] };
  };
  return { calls, get grants() { return current; }, query, async connect() { return { query, release() {} }; } };
}

test("administrator can save explicit user grants atomically", async () => {
  const db = database();
  const service = createUserManagementService(db as never, async () => "unused");
  const user = await service.updateManagedUserPermissions(2, ["issue.edit", "issue.helpdesk_references"], actor as never);
  assert.deepEqual(user.permissions, ["issue.view", "issue.edit", "issue.helpdesk_references"]);
  assert.equal(db.calls.some((call) => call.sql === "COMMIT"), true);
  assert.equal(db.calls.some((call) => call.params.includes("PERMISSIONS_CHANGED")), true);
});

test("non-admin and admin without management grant cannot save grants", async () => {
  const db = database();
  const service = createUserManagementService(db as never, async () => "unused");
  await assert.rejects(service.updateManagedUserPermissions(2, ["issue.view"], { ...actor, role: "USER" } as never));
  await assert.rejects(service.updateManagedUserPermissions(2, ["issue.view"], { ...actor, permissions: [] } as never));
  assert.equal(db.calls.length, 0);
});

test("unknown grant and admin-only reference grants are rejected for USER", async () => {
  const db = database();
  const service = createUserManagementService(db as never, async () => "unused");
  await assert.rejects(service.updateManagedUserPermissions(2, ["issue.unknown"], actor as never));
  await assert.rejects(service.updateManagedUserPermissions(2, ["issue.cr_references"], actor as never));
  await assert.rejects(service.updateManagedUserPermissions(2, ["issue.glpi_references"], actor as never));
  assert.deepEqual(db.grants, ["issue.view"]);
});

test("last active manager cannot lose management grant", async () => {
  const db = database({ ...baseUser, id: 1, username: "ROOT", role: "ADMIN" }, ["users.view", "users.manage"], 1);
  const service = createUserManagementService(db as never, async () => "unused");
  await assert.rejects(service.updateManagedUserPermissions(1, ["users.view"], actor as never));
  assert.equal(db.grants.includes("users.manage"), true);
});



test("new users receive selected grants and never inherit transport create", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM app_user_usernames r/i.test(sql)) return { rows: [] };
    if (/INSERT INTO app_users/i.test(sql)) return { rows: [{ ...baseUser, id: 8 }] };
    return { rows: [] };
  };
  const db = { query, async connect() { return { query, release() {} }; } };
  const service = createUserManagementService(db as never, async () => "hash");
  await service.createManagedUser({ username: "NEW", password: "initial1", role: "USER", permissions: ["issue.helpdesk_references"] }, actor as never);
  const insert = calls.find((call) => /INSERT INTO app_user_permissions/i.test(call.sql));
  assert.deepEqual(insert?.params[1], ["issue.view", "issue.helpdesk_references"]);
  assert.equal((insert?.params[1] as string[]).includes("transport.create"), false);
});

test("demoting a manager clears administrator-only grants", async () => {
  const target = { ...baseUser, id: 2, role: "ADMIN" };
  const db = database(target, ["users.view", "users.manage", "issue.cr_references", "issue.helpdesk_references"], 2);
  const service = createUserManagementService(db as never, async () => "unused");
  await service.updateManagedUserProfile(2, { role: "USER" }, actor as never);
  assert.equal(db.grants.includes("users.manage"), false);
  assert.equal(db.grants.includes("issue.cr_references"), false);
  assert.equal(db.grants.includes("issue.helpdesk_references"), true);
});

test("restored users receive reviewed grants", async () => {
  const archived = { ...baseUser, deleted_at: "2026-02-01T00:00:00Z", is_active: false };
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FOR UPDATE/i.test(sql) && /FROM app_users u/i.test(sql)) return { rows: [archived] };
    if (/FROM app_users u/i.test(sql) && /WHERE u.id = \$1/i.test(sql)) return { rows: [{ ...baseUser, permissions: ["issue.view"] }] };
    return { rows: [] };
  };
  const db = { query, async connect() { return { query, release() {} }; } };
  const service = createUserManagementService(db as never, async () => "hash");
  await service.restoreManagedUser(2, { password: "initial1", role: "USER", isActive: true, permissions: ["issue.view"] }, actor as never);
  assert.deepEqual(calls.find((call) => /INSERT INTO app_user_permissions/i.test(call.sql))?.params[1], ["issue.view"]);
});

test("profile role and permission changes are one transaction", async () => {
  const target = { ...baseUser, role: "ADMIN" };
  const db = database(target, ["users.view", "users.manage", "issue.cr_references"], 2);
  const service = createUserManagementService(db as never, async () => "unused");
  await service.updateManagedUserProfile(2, { role: "USER", permissions: ["issue.helpdesk_references"] }, actor as never);
  assert.deepEqual(db.grants, ["issue.view", "issue.helpdesk_references"]);
  assert.equal(db.calls.some((call) => call.sql === "COMMIT"), true);
});

test("last manager is protected during deactivate and archive", async () => {
  const manager = { ...baseUser, role: "ADMIN" };
  const db = database(manager, ["users.view", "users.manage"], 1);
  const service = createUserManagementService(db as never, async () => "unused");
  await assert.rejects(service.setManagedUserStatus(2, false, actor as never));
  await assert.rejects(service.archiveManagedUser(2, "retired", actor as never));
  assert.equal(db.calls.some((call) => /UPDATE app_users/i.test(call.sql)), false);
});
