import assert from "node:assert/strict";
import test from "node:test";
import { createUserManagementService } from "../src/server/users/userManagementService";
import { UserManagementError } from "../src/server/users/userManagementDomain";

const actor = { id: 1, username: "ROOT", role: "ADMIN" as const };
const target = {
  id: 2,
  username: "ALICE",
  role: "USER",
  is_active: true,
  must_change_password: false,
  last_login_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
  deleted_at: null,
  deleted_by_snapshot: null,
  delete_reason: null
};

class BehaviorDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];
  activeAdminCount = 2;
  currentTarget: any = target;
  reservation: any = null;

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    if (/FROM app_users u\s+WHERE u.id = \$1[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [this.currentTarget] };
    }
    if (/count\(\*\).*active_admin_count/i.test(text)) {
      return { rows: [{ active_admin_count: String(this.activeAdminCount) }] };
    }
    if (/FROM app_user_usernames r/i.test(text)) {
      return { rows: this.reservation ? [this.reservation] : [] };
    }
    if (/UPDATE app_users[\s\S]+RETURNING/i.test(text)) {
      return {
        rows: [{
          ...this.currentTarget,
          username: values.includes("RENAMED") ? "RENAMED" : this.currentTarget.username,
          role: values.includes("ADMIN") ? "ADMIN" : this.currentTarget.role,
          is_active: typeof values[0] === "boolean" ? values[0] : this.currentTarget.is_active
        }]
      };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

test("renames a stable user ID, retires the old name, audits before/after, and revokes sessions", async () => {
  const db = new BehaviorDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  const renamed = await service.updateManagedUserProfile(2, { username: "renamed" }, actor);

  assert.equal(renamed.id, 2);
  assert.equal(renamed.username, "RENAMED");
  assert.ok(db.calls.some((call) =>
    /UPDATE app_user_usernames[\s\S]+is_current = FALSE/i.test(call.text) &&
    call.values.includes("ALICE")
  ));
  assert.ok(db.calls.some((call) =>
    /INSERT INTO app_user_usernames/i.test(call.text) &&
    call.values.includes("RENAMED")
  ));
  const audit = db.calls.find((call) => /USERNAME_CHANGED/.test(call.text));
  assert.match(String(audit?.values[2]), /"before":"ALICE"/);
  assert.match(String(audit?.values[2]), /"after":"RENAMED"/);
  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
});

test("changes role with an audit and target session revocation", async () => {
  const db = new BehaviorDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  const updated = await service.updateManagedUserProfile(2, { role: "ADMIN" }, actor);

  assert.equal(updated.role, "ADMIN");
  assert.ok(db.calls.some((call) => /ROLE_CHANGED/.test(call.text)));
  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
});

test("rejects self-demotion inside the transaction", async () => {
  const db = new BehaviorDatabase();
  db.currentTarget = { ...target, id: actor.id, username: actor.username, role: "ADMIN" };
  const service = createUserManagementService(db as any, async () => "unused");

  await assert.rejects(
    () => service.updateManagedUserProfile(actor.id, { role: "USER" }, actor),
    (error: unknown) => error instanceof UserManagementError && error.statusCode === 403
  );
  assert.equal(db.calls.at(-1)?.text, "ROLLBACK");
});

test("deactivates another user, revokes sessions, and audits the status transition", async () => {
  const db = new BehaviorDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  const updated = await service.setManagedUserStatus(2, false, actor);

  assert.equal(updated.isActive, false);
  assert.ok(db.calls.some((call) => /USER_DEACTIVATED/.test(call.text)));
  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
});

test("rejects self-deactivation and a concurrent last-active-admin demotion", async () => {
  const selfDb = new BehaviorDatabase();
  selfDb.currentTarget = { ...target, id: actor.id, username: actor.username, role: "ADMIN" };
  const selfService = createUserManagementService(selfDb as any, async () => "unused");
  await assert.rejects(
    () => selfService.setManagedUserStatus(actor.id, false, actor),
    (error: unknown) => error instanceof UserManagementError && error.statusCode === 403
  );

  const lastAdminDb = new BehaviorDatabase();
  lastAdminDb.currentTarget = { ...target, role: "ADMIN" };
  lastAdminDb.activeAdminCount = 1;
  const lastAdminService = createUserManagementService(lastAdminDb as any, async () => "unused");
  await assert.rejects(
    () => lastAdminService.updateManagedUserProfile(2, { role: "USER" }, actor),
    (error: unknown) => error instanceof UserManagementError && error.statusCode === 403
  );
  assert.ok(lastAdminDb.calls.some((call) => /pg_advisory_xact_lock/i.test(call.text)));
});
