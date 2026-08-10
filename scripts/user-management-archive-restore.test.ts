import assert from "node:assert/strict";
import test from "node:test";
import { createUserManagementService } from "../src/server/users/userManagementService";
import { UserManagementError } from "../src/server/users/userManagementDomain";

const actor = { id: 1, username: "ROOT", role: "ADMIN" as const };
const baseTarget = {
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

class LifecycleDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];
  currentTarget: any = baseTarget;
  lastUpdated: any = null;
  activeAdminCount = 2;

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    if (/FROM app_users u\s+WHERE u.id = \$1[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [this.currentTarget] };
    }
    if (/count\(\*\).*active_admin_count/i.test(text)) {
      return { rows: [{ active_admin_count: String(this.activeAdminCount) }] };
    }
    if (/FROM app_users u[\s\S]+LEFT JOIN issue_people p[\s\S]+WHERE u.id = \$1/i.test(text)) {
      return { rows: [this.lastUpdated ?? this.currentTarget] };
    }
    if (/UPDATE app_users[\s\S]+RETURNING/i.test(text)) {
      this.lastUpdated = {
        ...this.currentTarget,
        role: values.includes("ADMIN") ? "ADMIN" : "USER",
        is_active: values.includes(false) ? false : true,
        must_change_password: true,
        deleted_at: null,
        deleted_by_snapshot: null,
        delete_reason: null
      };
      const {
        person_id: _personId,
        person_full_name: _personFullName,
        person_nickname: _personNickname,
        person_email: _personEmail,
        person_is_active: _personIsActive,
        ...returnedRow
      } = this.lastUpdated;
      return {
        rows: [returnedRow]
      };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

test("requires a non-empty archive reason before opening a transaction", async () => {
  const db = new LifecycleDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  await assert.rejects(() => service.archiveManagedUser(2, "  ", actor), UserManagementError);
  assert.equal(db.calls.length, 0);
});

test("soft archives another user, records actor/reason, revokes sessions, and audits", async () => {
  const db = new LifecycleDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  await service.archiveManagedUser(2, "Left company", actor);

  const archive = db.calls.find((call) => /UPDATE app_users[\s\S]+deleted_at = now/i.test(call.text));
  assert.ok(archive);
  assert.match(archive.text, /is_active = FALSE/i);
  assert.doesNotMatch(archive.text, /person_id/i);
  assert.deepEqual(archive.values, [actor.id, actor.username, "Left company", 2]);
  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
  const audit = db.calls.find((call) => /USER_ARCHIVED/.test(call.text));
  assert.match(String(audit?.values[2]), /"reason":"Left company"/);
});

test("blocks self archive and the final active administrator archive", async () => {
  const selfDb = new LifecycleDatabase();
  selfDb.currentTarget = { ...baseTarget, id: actor.id, username: actor.username, role: "ADMIN" };
  const selfService = createUserManagementService(selfDb as any, async () => "unused");
  await assert.rejects(
    () => selfService.archiveManagedUser(actor.id, "No", actor),
    (error: unknown) => error instanceof UserManagementError && error.statusCode === 403
  );

  const lastDb = new LifecycleDatabase();
  lastDb.currentTarget = { ...baseTarget, role: "ADMIN" };
  lastDb.activeAdminCount = 1;
  const lastService = createUserManagementService(lastDb as any, async () => "unused");
  await assert.rejects(
    () => lastService.archiveManagedUser(2, "No", actor),
    (error: unknown) => error instanceof UserManagementError && error.statusCode === 403
  );
});

test("restores the archived account with the same ID and new security state", async () => {
  const db = new LifecycleDatabase();
  db.currentTarget = {
    ...baseTarget,
    is_active: false,
    deleted_at: "2026-07-30T00:00:00.000Z",
    deleted_by_snapshot: "ROOT",
    delete_reason: "Left company"
  };
  const service = createUserManagementService(
    db as any,
    async (password) => `RESTORE_HASH_${password}`
  );

  const restored = await service.restoreManagedUser(
    2,
    { password: "initial2", role: "ADMIN", isActive: false },
    actor
  );

  assert.equal(restored.id, 2);
  assert.equal(restored.role, "ADMIN");
  assert.equal(restored.isActive, false);
  const update = db.calls.find((call) => /UPDATE app_users[\s\S]+deleted_at = NULL/i.test(call.text));
  assert.ok(update);
  assert.match(update.text, /deleted_by_user_id = NULL/i);
  assert.match(update.text, /must_change_password = TRUE/i);
  assert.ok(update.values.includes("RESTORE_HASH_initial2"));
  assert.ok(db.calls.some((call) => /UPDATE app_user_sessions[\s\S]+revoked_at/i.test(call.text)));
  const audit = db.calls.find((call) => /USER_RESTORED/.test(call.text));
  assert.ok(audit);
  assert.doesNotMatch(JSON.stringify(audit.values), /initial2|RESTORE_HASH|password/i);
});

test("restore response retains the archived account's linked person", async () => {
  const db = new LifecycleDatabase();
  db.currentTarget = {
    ...baseTarget,
    is_active: false,
    deleted_at: "2026-07-30T00:00:00.000Z",
    deleted_by_snapshot: "ROOT",
    delete_reason: "Left company",
    person_id: 12,
    person_full_name: "Alice Example",
    person_nickname: "Alice",
    person_email: "alice@example.test",
    person_is_active: false
  };
  const service = createUserManagementService(db as any, async () => "RESTORE_HASH");

  const restored = await service.restoreManagedUser(
    2,
    { password: "initial2", role: "USER", isActive: true },
    actor
  );

  assert.equal(restored.person?.id, 12);
  assert.equal(restored.person?.fullName, "Alice Example");
  assert.equal(restored.person?.isActive, false);
});
