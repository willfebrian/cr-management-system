import assert from "node:assert/strict";
import test from "node:test";
import { createUserManagementService } from "../src/server/users/userManagementService";
import { UserManagementError } from "../src/server/users/userManagementDomain";

const actor = { id: 1, username: "ROOT", role: "ADMIN" as const };

type Scenario = "normal" | "archived" | "inactive" | "owned" | "unique-race";

class AssignmentDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];
  private personId: number | null;

  constructor(
    private readonly scenario: Scenario = "normal",
    currentPersonId: number | null = null
  ) {
    this.personId = currentPersonId;
  }

  private userRow() {
    const current = this.personId === 11
      ? { fullName: "Previous Person", nickname: "Previous" }
      : { fullName: "Next Person", nickname: "Next" };
    return {
      id: 2,
      username: "ALICE",
      role: "USER",
      is_active: true,
      must_change_password: false,
      last_login_at: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
      deleted_at: this.scenario === "archived" ? "2026-08-01T00:00:00.000Z" : null,
      deleted_by_snapshot: null,
      delete_reason: null,
      person_id: this.personId,
      person_full_name: this.personId == null ? null : current.fullName,
      person_nickname: this.personId == null ? null : current.nickname,
      person_email: this.personId == null ? null : "person@example.test",
      person_is_active: this.personId != null
    };
  }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    if (/FROM app_users u[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [this.userRow()] };
    }
    if (/FROM issue_people[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [{
        id: 12,
        full_name: "Next Person",
        nickname: "Next",
        email: "next@example.test",
        is_active: this.scenario !== "inactive"
      }] };
    }
    if (/WHERE person_id = \$1 AND id <> \$2/i.test(text)) {
      return { rows: this.scenario === "owned" ? [{ id: 9, username: "BOB" }] : [] };
    }
    if (/UPDATE app_users SET person_id = \$1/i.test(text)) {
      if (this.scenario === "unique-race") {
        throw { code: "23505", constraint: "idx_app_users_person_unique" };
      }
      this.personId = Number(values[0]);
      return { rows: [{ id: 2 }] };
    }
    if (/UPDATE app_users SET person_id = NULL/i.test(text)) {
      this.personId = null;
      return { rows: [{ id: 2 }] };
    }
    if (/FROM app_users u[\s\S]+WHERE u.id = \$1/i.test(text)) {
      return { rows: [this.userRow()] };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

test("assigns an active person and audits the new identity", async () => {
  const db = new AssignmentDatabase();
  const service = createUserManagementService(db as any, async () => "unused");

  const user = await service.assignManagedUserPerson(2, 12, actor);

  assert.equal(user.person?.id, 12);
  assert.equal(db.calls[0]?.text, "BEGIN");
  const audit = db.calls.find((call) => call.values[2] === "PERSON_ASSIGNED");
  assert.ok(audit);
  assert.deepEqual(JSON.parse(String(audit.values[3])), {
    previousPersonId: null,
    previousPersonName: null,
    nextPersonId: 12,
    nextPersonName: "Next Person (Next)",
    actorUsername: "ROOT"
  });
  assert.equal(db.calls.at(-1)?.text, "COMMIT");
});

test("reassigns a person and audits previous and next snapshots", async () => {
  const db = new AssignmentDatabase("normal", 11);
  const service = createUserManagementService(db as any, async () => "unused");

  await service.assignManagedUserPerson(2, 12, actor);

  const audit = db.calls.find((call) => call.values[2] === "PERSON_REASSIGNED");
  assert.ok(audit);
  const metadata = JSON.parse(String(audit.values[3]));
  assert.equal(metadata.previousPersonId, 11);
  assert.equal(metadata.previousPersonName, "Previous Person (Previous)");
  assert.equal(metadata.nextPersonId, 12);
});

test("unassigns the current person and records its snapshot", async () => {
  const db = new AssignmentDatabase("normal", 11);
  const service = createUserManagementService(db as any, async () => "unused");

  const user = await service.unassignManagedUserPerson(2, actor);

  assert.equal(user.person, null);
  const audit = db.calls.find((call) => call.values[2] === "PERSON_UNASSIGNED");
  assert.ok(audit);
  assert.equal(JSON.parse(String(audit.values[3])).previousPersonId, 11);
});

test("repeating assign and unassign is idempotent without audit duplication", async () => {
  const assignedDb = new AssignmentDatabase("normal", 12);
  await createUserManagementService(assignedDb as any).assignManagedUserPerson(2, 12, actor);
  assert.equal(assignedDb.calls.some((call) => /^PERSON_/.test(String(call.values[2]))), false);

  const emptyDb = new AssignmentDatabase();
  await createUserManagementService(emptyDb as any).unassignManagedUserPerson(2, actor);
  assert.equal(emptyDb.calls.some((call) => /^PERSON_/.test(String(call.values[2]))), false);
});

test("rejects archived users, inactive people, and people owned by another account", async () => {
  const expected: Array<[Scenario, number, string]> = [
    ["archived", 404, "USER_ASSIGNMENT_UNAVAILABLE"],
    ["inactive", 409, "PERSON_INACTIVE"],
    ["owned", 409, "PERSON_ALREADY_ASSIGNED"]
  ];
  for (const [scenario, status, code] of expected) {
    const db = new AssignmentDatabase(scenario);
    const service = createUserManagementService(db as any);
    await assert.rejects(
      () => service.assignManagedUserPerson(2, 12, actor),
      (error: unknown) => error instanceof UserManagementError
        && error.statusCode === status
        && error.code === code
    );
    assert.equal(db.calls.at(-1)?.text, "ROLLBACK");
  }
});

test("translates the unique-index race loser into an assignment conflict", async () => {
  const db = new AssignmentDatabase("unique-race");
  const service = createUserManagementService(db as any);

  await assert.rejects(
    () => service.assignManagedUserPerson(2, 12, actor),
    (error: unknown) => error instanceof UserManagementError
      && error.statusCode === 409
      && error.code === "PERSON_ALREADY_ASSIGNED"
  );
  assert.equal(db.calls.at(-1)?.text, "ROLLBACK");
});
