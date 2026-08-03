import assert from "node:assert/strict";
import test from "node:test";
import { createUserManagementService } from "../src/server/users/userManagementService";
import { UserManagementError } from "../src/server/users/userManagementDomain";

type QueryResult = { rows?: any[]; rowCount?: number };

class ScriptedDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];

  constructor(private readonly responses: QueryResult[]) {}

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    return this.responses.shift() ?? { rows: [], rowCount: 0 };
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

const actor = { id: 1, username: "ROOT", role: "ADMIN" as const };
const dbUser = {
  id: 2,
  username: "ALICE",
  role: "USER",
  is_active: false,
  must_change_password: true,
  last_login_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
  deleted_at: null,
  deleted_by_snapshot: null,
  delete_reason: null
};

test("lists active and inactive non-archived users with parameterized filters and pagination", async () => {
  const db = new ScriptedDatabase([{ rows: [{ total: "1" }] }, { rows: [dbUser] }]);
  const service = createUserManagementService(db as any, async () => "unused");

  const result = await service.listManagedUsers(
    { q: "ali", role: "USER", status: "inactive", scope: "current", page: 2, pageSize: 10 },
    actor
  );

  assert.equal(result.total, 1);
  assert.equal(result.users[0]?.username, "ALICE");
  assert.equal(result.users[0]?.isActive, false);
  assert.match(db.calls[0]!.text, /deleted_at IS NULL/i);
  assert.match(db.calls[0]!.text, /username ILIKE/i);
  assert.match(db.calls[0]!.text, /role =/i);
  assert.match(db.calls[0]!.text, /is_active =/i);
  assert.deepEqual(db.calls[0]!.values, ["%ALI%", "USER", false]);
  assert.deepEqual(db.calls[1]!.values.slice(-2), [10, 10]);
});

test("lists archived users only when archived scope is requested", async () => {
  const db = new ScriptedDatabase([{ rows: [{ total: "0" }] }, { rows: [] }]);
  const service = createUserManagementService(db as any, async () => "unused");

  await service.listManagedUsers({ scope: "archived" }, actor);

  assert.match(db.calls[0]!.text, /deleted_at IS NOT NULL/i);
});

test("returns immutable audit entries without authentication secrets", async () => {
  const db = new ScriptedDatabase([
    {
      rows: [{
        id: 9,
        actor_user_id: 1,
        actor_username: "ROOT",
        target_user_id: 2,
        action: "USER_CREATED",
        metadata: { username: "ALICE" },
        created_at: "2026-07-02T00:00:00.000Z"
      }]
    }
  ]);
  const service = createUserManagementService(db as any, async () => "unused");

  const entries = await service.getManagedUserAudit(2, actor);

  assert.deepEqual(entries[0]?.metadata, { username: "ALICE" });
  assert.doesNotMatch(db.calls[0]!.text, /password_hash/i);
});

test("creates a user and permanent current reservation in one transaction", async () => {
  const db = new ScriptedDatabase([
    {}, // begin
    {}, // advisory lock
    { rows: [] }, // reservation lookup
    { rows: [dbUser] }, // user insert
    {}, // reservation insert
    {}, // audit insert
    {} // commit
  ]);
  const service = createUserManagementService(db as any, async (password) => `HASH:${password.length}`);

  const created = await service.createManagedUser(
    { username: " alice ", password: "initial1", role: "USER", isActive: false },
    actor
  );

  assert.equal(created.id, 2);
  assert.equal(created.username, "ALICE");
  assert.equal(db.calls[0]!.text, "BEGIN");
  assert.match(db.calls[1]!.text, /pg_advisory_xact_lock/i);
  assert.match(db.calls[4]!.text, /INSERT INTO app_user_usernames/i);
  assert.deepEqual(db.calls[4]!.values.slice(0, 3), ["ALICE", "ALICE", 2]);
  assert.match(db.calls[5]!.text, /USER_CREATED/);
  assert.doesNotMatch(JSON.stringify(db.calls[5]!.values), /initial1|HASH:/);
  assert.equal(db.calls.at(-1)?.text, "COMMIT");
});

test("turns an archived username reservation into a safe restore conflict", async () => {
  const db = new ScriptedDatabase([
    {},
    {},
    { rows: [{ user_id: 42, deleted_at: "2026-07-30T00:00:00.000Z" }] },
    {}
  ]);
  const service = createUserManagementService(db as any, async () => "never");

  await assert.rejects(
    () => service.createManagedUser(
      { username: "old-user", password: "initial1", role: "USER" },
      actor
    ),
    (error: unknown) => {
      assert.ok(error instanceof UserManagementError);
      assert.equal(error.statusCode, 409);
      assert.deepEqual(error.details, { archivedUserId: 42, canRestore: true });
      return true;
    }
  );
  assert.equal(db.calls.at(-1)?.text, "ROLLBACK");
});

test("rejects current and retired username reservations", async () => {
  for (const reservation of [
    { user_id: 3, deleted_at: null, is_current: true },
    { user_id: 3, deleted_at: null, is_current: false }
  ]) {
    const db = new ScriptedDatabase([{}, {}, { rows: [reservation] }, {}]);
    const service = createUserManagementService(db as any, async () => "never");
    await assert.rejects(
      () => service.createManagedUser(
        { username: "reserved", password: "initial1", role: "USER" },
        actor
      ),
      (error: unknown) => error instanceof UserManagementError && error.statusCode === 409
    );
  }
});
