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

class SecurityDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];
  currentTarget: any = target;

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    if (/FROM app_users u\s+WHERE u.id = \$1[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [this.currentTarget] };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

test("rejects a reset password shorter than eight characters", async () => {
  const db = new SecurityDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  await assert.rejects(
    () => service.resetManagedUserPassword(2, "short", actor),
    UserManagementError
  );
  assert.equal(db.calls.length, 0);
});

test("rejects management reset of the current administrator account", async () => {
  const db = new SecurityDatabase();
  db.currentTarget = { ...target, id: actor.id, username: actor.username, role: "ADMIN" };
  const service = createUserManagementService(db as any, async () => "unused");

  await assert.rejects(
    () => service.resetManagedUserPassword(actor.id, "initial1", actor),
    (error: unknown) => error instanceof UserManagementError && error.statusCode === 403
  );
  assert.equal(db.calls.at(-1)?.text, "ROLLBACK");
});

test("resets password state, revokes sessions, and audits without password data", async () => {
  const db = new SecurityDatabase();
  const service = createUserManagementService(
    db as any,
    async (password) => `SECRET_HASH_${password}`
  );

  await service.resetManagedUserPassword(2, "initial1", actor);

  const update = db.calls.find((call) => /UPDATE app_users[\s\S]+password_hash/i.test(call.text));
  assert.ok(update);
  assert.match(update.text, /must_change_password = TRUE/i);
  assert.match(update.text, /password_changed_at = NULL/i);
  assert.equal(update.values[0], "SECRET_HASH_initial1");
  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
  const audit = db.calls.find((call) => /PASSWORD_RESET/.test(call.text));
  assert.ok(audit);
  assert.doesNotMatch(JSON.stringify(audit.values), /initial1|SECRET_HASH|password/i);
});

test("force logout revokes every target session and writes a safe audit", async () => {
  const db = new SecurityDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  await service.revokeManagedUserSessions(2, actor);

  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
  const audit = db.calls.find((call) => /SESSIONS_REVOKED/.test(call.text));
  assert.match(String(audit?.values[2]), /"targetUsername":"ALICE"/);
  assert.doesNotMatch(JSON.stringify(audit?.values), /token|password|hash/i);
});
