# User-Person Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, ADMIN-managed one-to-one link between `app_users` accounts and `issue_people` records, including assign/reassign/unassign workflows, audit history, deletion protection, and User Management UI.

**Architecture:** Store the current relationship as nullable `app_users.person_id`, protected by a foreign key and a partial unique index. Extend the existing User Management service and routes for reads and transactional mutations, keep person-deletion protection in a focused admin service, and add one focused assignment dialog coordinated by the existing workspace.

**Tech Stack:** PostgreSQL SQL migrations, Node.js/Express, TypeScript, React 19, Node test runner with `tsx`, server-rendered React component tests, CSS.

## Global Constraints

- One account belongs to at most one person, and one person belongs to at most one account.
- Existing and new accounts may remain unassigned; account creation does not select a person.
- Only ADMIN may search assignment candidates or assign, reassign, and unassign.
- Assignment is manual; do not infer links from username, email, full name, or nickname.
- Only active people may be newly assigned; an existing link remains when its person later becomes inactive.
- Archived accounts retain their link and expose it read-only until restored.
- A linked person cannot be deleted until the account is unassigned.
- Assignment changes do not change authentication, role, password, or session behavior.
- Effective mutations create immutable `app_user_audit_logs` entries; idempotent repeats do not.
- Do not add runtime dependencies for this enhancement.

---

## File Structure

### Create

- `database/migrations/20260810_user_person_assignment.sql` — additive relationship migration and uniqueness enforcement.
- `scripts/user-management-person-assignment.test.ts` — transaction, validation, idempotency, uniqueness-conflict, and audit tests.
- `src/server/admin/peopleAdminService.ts` — linked-person deletion guard and deletion operation.
- `scripts/admin-people-link-protection.test.ts` — focused tests for protected person deletion.
- `src/client/components/users/UserPersonAssignmentDialog.tsx` — candidate search, selection, and confirmation UI.

### Modify

- `database/schema.sql` — canonical schema mirror of the migration.
- `scripts/user-management-schema-contract.test.mjs` — relationship DDL contract.
- `src/shared/userManagementTypes.ts` — linked-person, option, payload, and audit types.
- `src/server/users/userManagementService.ts` — joined reads, candidate search, and assignment mutations.
- `scripts/user-management-service-read.test.ts` — joined user and candidate-search coverage.
- `src/server/routes/userRoutes.ts` — three ADMIN-only person-assignment endpoints.
- `scripts/user-management-routes.test.ts` — validation, routing, and error-response coverage.
- `src/client/api/userManagementApi.ts` — person-option and mutation API functions.
- `scripts/user-management-client-api.test.ts` — URL, method, and payload coverage.
- `src/server/routes/adminRoutes.ts` — delegate person deletion and return explicit 404/409 errors.
- `src/client/components/users/UserManagementWorkspace.tsx` — linked identity in list and assignment orchestration.
- `src/client/components/users/UserDetailPanel.tsx` — linked-person detail and actions.
- `src/client/styles/user-management.css` — assignment states and dialog layout.
- `scripts/user-management-workspace.test.tsx` — list, detail, dialog, disabled-option, confirmation, and orchestration coverage.
- `package.json` — include new tests in `test:users`.

---

### Task 1: Add the one-to-one database relationship

**Files:**

- Create: `database/migrations/20260810_user_person_assignment.sql`
- Modify: `database/schema.sql:542-588`
- Modify: `scripts/user-management-schema-contract.test.mjs`

**Interfaces:**

- Produces: nullable `app_users.person_id BIGINT` referencing `issue_people(id)` with `ON DELETE RESTRICT`.
- Produces: partial unique index `idx_app_users_person_unique` on non-null `person_id`.
- Consumes: existing `issue_people(id)` and `app_users` tables.

- [ ] **Step 1: Write the failing schema-contract test**

Append a test that reads the new migration and canonical schema:

```js
const assignmentMigrationUrl = new URL(
  "../database/migrations/20260810_user_person_assignment.sql",
  import.meta.url
);
const schemaUrl = new URL("../database/schema.sql", import.meta.url);

test("user-person assignment is nullable, referential, unique, and additive", async () => {
  const [migration, schema] = await Promise.all([
    readFile(assignmentMigrationUrl, "utf8"),
    readFile(schemaUrl, "utf8")
  ]);
  for (const sql of [migration, schema]) {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS person_id BIGINT/i);
    assert.match(sql, /person_id[\s\S]+REFERENCES issue_people\s*\(id\)\s+ON DELETE RESTRICT/i);
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_person_unique[\s\S]+ON app_users\s*\(person_id\)[\s\S]+WHERE person_id IS NOT NULL/i);
  }
  assert.doesNotMatch(migration, /UPDATE app_users[\s\S]+SET person_id/i);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```powershell
node scripts/user-management-schema-contract.test.mjs
```

Expected: FAIL because `20260810_user_person_assignment.sql` does not exist.

- [ ] **Step 3: Add the idempotent migration and canonical schema DDL**

Create the migration and add the same `ALTER TABLE`/index block immediately after the existing `app_users` lifecycle columns in `database/schema.sql`:

```sql
BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS person_id BIGINT
  REFERENCES issue_people(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_person_unique
  ON app_users (person_id)
  WHERE person_id IS NOT NULL;

COMMIT;
```

- [ ] **Step 4: Run the schema contract and verify it passes**

Run:

```powershell
node scripts/user-management-schema-contract.test.mjs
```

Expected: all schema-contract tests PASS.

- [ ] **Step 5: Commit the schema slice**

```powershell
git add database/migrations/20260810_user_person_assignment.sql database/schema.sql scripts/user-management-schema-contract.test.mjs
git commit -m "feat: add user person relationship schema"
```

---

### Task 2: Extend read models and person-option search

**Files:**

- Modify: `src/shared/userManagementTypes.ts:1-66`
- Modify: `src/server/users/userManagementService.ts:47-188,638-660`
- Modify: `scripts/user-management-service-read.test.ts`

**Interfaces:**

- Produces: `ManagedUserPerson`, `ManagedUserPersonOption`, and `ManagedUser.person`.
- Produces: `listManagedUserPersonOptions(query, actor): Promise<ManagedUserPersonOption[]>`.
- Consumes: `ManagementActor`, `ManagedUser`, `issue_people`, and `app_users.person_id` from Task 1.

- [ ] **Step 1: Write failing joined-read and option-search tests**

Extend the scripted database fixture with aliased person columns and add assertions:

```ts
const dbUserWithPerson = {
  ...dbUser,
  person_id: 12,
  person_full_name: "Alice Wijaya",
  person_nickname: "Alice",
  person_email: "alice@example.test",
  person_is_active: true
};

test("returns linked person and searches username, full name, or nickname", async () => {
  const db = new ScriptedDatabase([
    { rows: [{ total: "1" }] },
    { rows: [dbUserWithPerson] }
  ]);
  const service = createUserManagementService(db as any, async () => "unused");
  const result = await service.listManagedUsers({ q: "alice" }, actor);

  assert.deepEqual(result.users[0]?.person, {
    id: 12,
    fullName: "Alice Wijaya",
    nickname: "Alice",
    email: "alice@example.test",
    isActive: true
  });
  assert.match(db.calls[0]!.text, /u\.username ILIKE[\s\S]+p\.full_name ILIKE[\s\S]+p\.nickname ILIKE/i);
});

test("lists active and inactive people with assignment ownership", async () => {
  const db = new ScriptedDatabase([{ rows: [{
    id: 12,
    full_name: "Alice Wijaya",
    nickname: "Alice",
    email: "alice@example.test",
    is_active: false,
    assigned_user_id: 2,
    assigned_username: "ALICE",
    assigned_user_deleted_at: null
  }] }]);
  const service = createUserManagementService(db as any, async () => "unused");
  const options = await service.listManagedUserPersonOptions("wij", actor);

  assert.equal(options[0]?.isActive, false);
  assert.deepEqual(options[0]?.assignedUser, {
    id: 2,
    username: "ALICE",
    deletedAt: null
  });
  assert.deepEqual(db.calls[0]!.values, ["%wij%"]);
});
```

- [ ] **Step 2: Run the focused read tests and verify they fail**

Run:

```powershell
npx tsx --test scripts/user-management-service-read.test.ts
```

Expected: FAIL because `ManagedUser.person` and `listManagedUserPersonOptions` do not exist.

- [ ] **Step 3: Add exact shared types**

Add:

```ts
export type ManagedUserPerson = {
  id: number;
  fullName: string | null;
  nickname: string | null;
  email: string | null;
  isActive: boolean;
};

export type ManagedUserPersonOption = ManagedUserPerson & {
  assignedUser: {
    id: number;
    username: string;
    deletedAt: string | null;
  } | null;
};
```

Add `person: ManagedUserPerson | null` to `ManagedUser` and add the three person actions to `UserAuditAction`.

- [ ] **Step 4: Map joined person rows and extend list search**

Add a focused mapper:

```ts
function toManagedUserPerson(row: any): ManagedUserPerson | null {
  if (row.person_id == null) return null;
  return {
    id: Number(row.person_id),
    fullName: row.person_full_name ?? null,
    nickname: row.person_nickname ?? null,
    email: row.person_email ?? null,
    isActive: Boolean(row.person_is_active)
  };
}
```

Set `person: toManagedUserPerson(row)` in `toManagedUser`. In both list queries, add:

```sql
LEFT JOIN issue_people p ON p.id = u.person_id
```

Select these aliases:

```sql
u.person_id,
p.full_name AS person_full_name,
p.nickname AS person_nickname,
p.email AS person_email,
p.is_active AS person_is_active
```

Replace the username-only search clause with:

```ts
values.push(`%${filters.q.trim()}%`);
clauses.push(`(
  u.username ILIKE $${values.length}
  OR p.full_name ILIKE $${values.length}
  OR p.nickname ILIKE $${values.length}
)`);
```

Do not call `normalizeManagedUsername` for general name search because full names and nicknames must retain their natural input.

- [ ] **Step 5: Implement and export candidate search**

Add inside `createUserManagementService`:

```ts
async function listManagedUserPersonOptions(
  query: string,
  actor: ManagementActor
): Promise<ManagedUserPersonOption[]> {
  assertAdmin(actor);
  const value = `%${String(query ?? "").trim()}%`;
  const result = await database.query(
    `SELECT p.id, p.full_name, p.nickname, p.email, p.is_active,
            u.id AS assigned_user_id,
            u.username AS assigned_username,
            u.deleted_at AS assigned_user_deleted_at
       FROM issue_people p
       LEFT JOIN app_users u ON u.person_id = p.id
      WHERE p.full_name ILIKE $1 OR p.nickname ILIKE $1
      ORDER BY coalesce(p.full_name, p.nickname), p.id
      LIMIT 100`,
    [value]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    fullName: row.full_name ?? null,
    nickname: row.nickname ?? null,
    email: row.email ?? null,
    isActive: Boolean(row.is_active),
    assignedUser: row.assigned_user_id == null ? null : {
      id: Number(row.assigned_user_id),
      username: String(row.assigned_username),
      deletedAt: nullableIso(row.assigned_user_deleted_at)
    }
  }));
}
```

Return it from the service factory and export it from the default service.

- [ ] **Step 6: Run read tests and the TypeScript build**

Run:

```powershell
npx tsx --test scripts/user-management-service-read.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the read-model slice**

```powershell
git add src/shared/userManagementTypes.ts src/server/users/userManagementService.ts scripts/user-management-service-read.test.ts
git commit -m "feat: expose linked people in user management"
```

---

### Task 3: Implement transactional assign, reassign, and unassign

**Files:**

- Create: `scripts/user-management-person-assignment.test.ts`
- Modify: `src/server/users/userManagementService.ts:90-130,638-660`
- Modify: `package.json`

**Interfaces:**

- Produces: `assignManagedUserPerson(userId, personId, actor): Promise<ManagedUser>`.
- Produces: `unassignManagedUserPerson(userId, actor): Promise<ManagedUser>`.
- Produces error codes: `PERSON_INACTIVE`, `PERSON_ALREADY_ASSIGNED`, and `USER_ASSIGNMENT_UNAVAILABLE`.
- Consumes: joined managed-user mapper and shared types from Task 2.

- [ ] **Step 1: Write failing service tests for the complete mutation matrix**

Create a behavior-driven fake database and tests with these concrete assertions:

```ts
test("assigns an active person and audits snapshots in one transaction", async () => {
  const db = new AssignmentDatabase();
  const service = createUserManagementService(db as any, async () => "unused");
  const user = await service.assignManagedUserPerson(2, 12, actor);

  assert.equal(user.person?.id, 12);
  assert.equal(db.calls[0]?.text, "BEGIN");
  assert.ok(db.calls.some((call) => /FROM app_users[\s\S]+FOR UPDATE/i.test(call.text)));
  assert.ok(db.calls.some((call) => /FROM issue_people[\s\S]+FOR UPDATE/i.test(call.text)));
  const audit = db.calls.find((call) => /PERSON_ASSIGNED/.test(call.text));
  assert.match(String(audit?.values[2]), /"previousPersonId":null/);
  assert.match(String(audit?.values[2]), /"nextPersonId":12/);
  assert.equal(db.calls.at(-1)?.text, "COMMIT");
});

test("reassignment records previous and next person snapshots", async () => {
  const db = new AssignmentDatabase({ currentPersonId: 11 });
  const service = createUserManagementService(db as any, async () => "unused");
  await service.assignManagedUserPerson(2, 12, actor);
  assert.ok(db.calls.some((call) => /PERSON_REASSIGNED/.test(call.text)));
});

test("assignment rejects archived users, inactive people, and owned people", async () => {
  for (const scenario of ["archived-user", "inactive-person", "owned-person"] as const) {
    const db = new AssignmentDatabase({ scenario });
    const service = createUserManagementService(db as any, async () => "unused");
    await assert.rejects(
      () => service.assignManagedUserPerson(2, 12, actor),
      (error: unknown) => error instanceof UserManagementError && error.statusCode >= 404
    );
    assert.equal(db.calls.at(-1)?.text, "ROLLBACK");
  }
});

test("repeating assign and unassign is idempotent without duplicate audit", async () => {
  const assignedDb = new AssignmentDatabase({ currentPersonId: 12 });
  await createUserManagementService(assignedDb as any).assignManagedUserPerson(2, 12, actor);
  assert.equal(assignedDb.calls.filter((call) => /PERSON_/.test(call.text)).length, 0);

  const emptyDb = new AssignmentDatabase({ currentPersonId: null });
  await createUserManagementService(emptyDb as any).unassignManagedUserPerson(2, actor);
  assert.equal(emptyDb.calls.filter((call) => /PERSON_/.test(call.text)).length, 0);
});

test("translates the unique-index race loser into a 409 conflict", async () => {
  const db = new AssignmentDatabase({ scenario: "unique-race" });
  const service = createUserManagementService(db as any);
  await assert.rejects(
    () => service.assignManagedUserPerson(2, 12, actor),
    (error: unknown) => error instanceof UserManagementError
      && error.statusCode === 409
      && error.code === "PERSON_ALREADY_ASSIGNED"
  );
});
```

Use this deterministic fake shape so every query branch is explicit:

```ts
type AssignmentScenario =
  | "normal"
  | "archived-user"
  | "inactive-person"
  | "owned-person"
  | "unique-race";

class AssignmentDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];
  private personId: number | null;
  private readonly scenario: AssignmentScenario;

  constructor(options: {
    currentPersonId?: number | null;
    scenario?: AssignmentScenario;
  } = {}) {
    this.personId = options.currentPersonId ?? null;
    this.scenario = options.scenario ?? "normal";
  }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    if (/FROM app_users u[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [{
        ...dbUser,
        deleted_at: this.scenario === "archived-user" ? "2026-08-01T00:00:00.000Z" : null,
        person_id: this.personId,
        person_full_name: this.personId === 11 ? "Previous Person" : null,
        person_nickname: this.personId === 11 ? "Previous" : null,
        person_email: null,
        person_is_active: this.personId != null
      }] };
    }
    if (/FROM issue_people[\s\S]+FOR UPDATE/i.test(text)) {
      return { rows: [{
        id: 12,
        full_name: "Next Person",
        nickname: "Next",
        email: "next@example.test",
        is_active: this.scenario !== "inactive-person"
      }] };
    }
    if (/WHERE person_id = \$1 AND id <> \$2/i.test(text)) {
      return { rows: this.scenario === "owned-person"
        ? [{ id: 9, username: "BOB" }]
        : [] };
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
    if (/WHERE u.id = \$1/i.test(text)) {
      return { rows: [{
        ...dbUser,
        person_id: this.personId,
        person_full_name: this.personId == null ? null : "Next Person",
        person_nickname: this.personId == null ? null : "Next",
        person_email: this.personId == null ? null : "next@example.test",
        person_is_active: this.personId != null
      }] };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}
```

- [ ] **Step 2: Register and run the new test to verify failure**

Add `scripts/user-management-person-assignment.test.ts` to `test:users`, then run:

```powershell
npx tsx --test scripts/user-management-person-assignment.test.ts
```

Expected: FAIL because mutation methods do not exist.

- [ ] **Step 3: Add focused row and snapshot helpers**

Add `UserAuditAction` to the shared-type imports. Extend `getTargetForUpdate` to select the current person columns via a left join. Add:

```ts
function personDisplayName(row: {
  full_name?: string | null;
  nickname?: string | null;
}): string | null {
  const fullName = String(row.full_name ?? "").trim();
  const nickname = String(row.nickname ?? "").trim();
  if (fullName && nickname) return `${fullName} (${nickname})`;
  return fullName || nickname || null;
}

function assignmentMetadata(previous: any | null, next: any | null) {
  return {
    previousPersonId: previous?.id == null ? null : Number(previous.id),
    previousPersonName: previous ? personDisplayName(previous) : null,
    nextPersonId: next?.id == null ? null : Number(next.id),
    nextPersonName: next ? personDisplayName(next) : null
  };
}
```

- [ ] **Step 4: Implement assignment and uniqueness-error translation**

Use one transaction and preserve the exact operation order:

```ts
async function assignManagedUserPerson(
  userId: number,
  personId: number,
  actor: ManagementActor
): Promise<ManagedUser> {
  assertAdmin(actor);
  if (!Number.isSafeInteger(personId) || personId <= 0) {
    throw new UserManagementError("Person ID tidak valid");
  }
  try {
    return await inTransaction(database, async (client) => {
      const target = await getTargetForUpdate(client, userId);
      if (target.deleted_at) {
        throw new UserManagementError(
          "Archived user harus dipulihkan sebelum assignment diubah",
          404,
          "USER_ASSIGNMENT_UNAVAILABLE"
        );
      }
      const personResult = await client.query(
        `SELECT id, full_name, nickname, email, is_active
           FROM issue_people
          WHERE id = $1
          FOR UPDATE`,
        [personId]
      );
      const nextPerson = personResult.rows[0];
      if (!nextPerson) throw new UserManagementError("Person tidak ditemukan", 404);
      if (!nextPerson.is_active) {
        throw new UserManagementError(
          "Person inactive tidak dapat di-assign",
          409,
          "PERSON_INACTIVE"
        );
      }
      if (Number(target.person_id) === personId) return toManagedUser(target);
      const ownerResult = await client.query(
        `SELECT id, username FROM app_users WHERE person_id = $1 AND id <> $2`,
        [personId, userId]
      );
      const owner = ownerResult.rows[0];
      if (owner) {
        throw new UserManagementError(
          `Person sudah terhubung ke akun ${owner.username}`,
          409,
          "PERSON_ALREADY_ASSIGNED",
          { assignedUserId: Number(owner.id), assignedUsername: owner.username }
        );
      }
      const previous = target.person_id == null ? null : {
        id: target.person_id,
        full_name: target.person_full_name,
        nickname: target.person_nickname
      };
      const updated = await client.query(
        `UPDATE app_users SET person_id = $1, updated_at = now()
          WHERE id = $2
          RETURNING id`,
        [personId, userId]
      );
      await insertUserAudit(
        client,
        actor,
        userId,
        previous ? "PERSON_REASSIGNED" : "PERSON_ASSIGNED",
        assignmentMetadata(previous, nextPerson)
      );
      return getManagedUserById(client, Number(updated.rows[0].id));
    });
  } catch (error: any) {
    if (error?.code === "23505" && error?.constraint === "idx_app_users_person_unique") {
      throw new UserManagementError(
        "Person sudah terhubung ke akun lain",
        409,
        "PERSON_ALREADY_ASSIGNED"
      );
    }
    throw error;
  }
}
```

Add these exact focused helpers so mutation methods do not duplicate audit/refresh SQL:

```ts
async function insertUserAudit(
  client: Queryable,
  actor: ManagementActor,
  targetUserId: number,
  action: UserAuditAction,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO app_user_audit_logs (
       actor_user_id, target_user_id, action, metadata
     ) VALUES ($1, $2, $3, $4::jsonb)`,
    [
      actor.id,
      targetUserId,
      action,
      JSON.stringify({ ...metadata, actorUsername: actor.username })
    ]
  );
}

async function getManagedUserById(
  client: Queryable,
  userId: number
): Promise<ManagedUser> {
  const result = await client.query(
    `SELECT u.id, u.username, u.role, u.is_active, u.must_change_password,
            u.last_login_at, u.created_at, u.updated_at, u.deleted_at,
            u.deleted_by_snapshot, u.delete_reason, u.person_id,
            p.full_name AS person_full_name,
            p.nickname AS person_nickname,
            p.email AS person_email,
            p.is_active AS person_is_active
       FROM app_users u
       LEFT JOIN issue_people p ON p.id = u.person_id
      WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new UserManagementError("User tidak ditemukan", 404);
  return toManagedUser(row);
}
```

- [ ] **Step 5: Implement idempotent unassignment**

```ts
async function unassignManagedUserPerson(
  userId: number,
  actor: ManagementActor
): Promise<ManagedUser> {
  assertAdmin(actor);
  return inTransaction(database, async (client) => {
    const target = await getTargetForUpdate(client, userId);
    if (target.deleted_at) {
      throw new UserManagementError(
        "Archived user harus dipulihkan sebelum assignment diubah",
        404,
        "USER_ASSIGNMENT_UNAVAILABLE"
      );
    }
    if (target.person_id == null) return toManagedUser(target);
    const previous = {
      id: target.person_id,
      full_name: target.person_full_name,
      nickname: target.person_nickname
    };
    await client.query(
      `UPDATE app_users SET person_id = NULL, updated_at = now() WHERE id = $1`,
      [userId]
    );
    await insertUserAudit(
      client,
      actor,
      userId,
      "PERSON_UNASSIGNED",
      assignmentMetadata(previous, null)
    );
    return getManagedUserById(client, userId);
  });
}
```

Return and export both methods from the service factory/default service.

- [ ] **Step 6: Run mutation and existing lifecycle tests**

Run:

```powershell
npx tsx --test scripts/user-management-person-assignment.test.ts scripts/user-management-profile-status.test.ts scripts/user-management-archive-restore.test.ts scripts/user-management-security-actions.test.ts
```

Expected: all tests PASS, including rollback and no-secret audit assertions.

- [ ] **Step 7: Commit the mutation slice**

```powershell
git add src/server/users/userManagementService.ts scripts/user-management-person-assignment.test.ts package.json
git commit -m "feat: manage user person assignments"
```

---

### Task 4: Expose routes and client API

**Files:**

- Modify: `src/server/routes/userRoutes.ts:1-288`
- Modify: `scripts/user-management-routes.test.ts`
- Modify: `src/client/api/userManagementApi.ts:1-137`
- Modify: `scripts/user-management-client-api.test.ts`

**Interfaces:**

- Produces: `GET /api/users/person-options?q=...` returning `{ rows }`.
- Produces: `PUT /api/users/:id/person` with `{ personId }`, returning `{ user }`.
- Produces: `DELETE /api/users/:id/person`, returning `{ user }`.
- Produces client functions `fetchManagedUserPersonOptions`, `assignManagedUserPerson`, and `unassignManagedUserPerson`.
- Consumes service methods from Tasks 2-3.

- [ ] **Step 1: Add failing route tests and fake-service methods**

Extend `fakeService` with the three methods, then add:

```ts
test("validates and exposes person option, assign, and unassign routes", async () => {
  const received: unknown[] = [];
  const service = fakeService({
    listManagedUserPersonOptions: async (q: string) => {
      received.push(["options", q]);
      return [];
    },
    assignManagedUserPerson: async (userId: number, personId: number) => {
      received.push(["assign", userId, personId]);
      return { ...user, person: null };
    },
    unassignManagedUserPerson: async (userId: number) => {
      received.push(["unassign", userId]);
      return { ...user, person: null };
    }
  });
  await withServer(service, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-role": "ADMIN" };
    assert.equal((await fetch(`${baseUrl}/api/users/person-options?q=ali`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/users/2/person`, {
      method: "PUT", headers, body: JSON.stringify({ personId: 12 })
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/users/2/person`, {
      method: "DELETE", headers
    })).status, 200);
    const invalid = await fetch(`${baseUrl}/api/users/2/person`, {
      method: "PUT", headers, body: JSON.stringify({ personId: 0 })
    });
    assert.equal(invalid.status, 400);
  });
  assert.deepEqual(received, [
    ["options", "ali"],
    ["assign", 2, 12],
    ["unassign", 2]
  ]);
});
```

Also include all three URLs in the existing non-ADMIN rejection test and assert the service call count remains zero.

- [ ] **Step 2: Add failing client-contract assertions**

Import the new client functions and append:

```ts
test("sends person assignment operations to explicit endpoints", async () => {
  const capture = captureFetch({ rows: [], user: { id: 2, person: null } });
  try {
    await fetchManagedUserPersonOptions("A B");
    await assignManagedUserPerson(2, 12);
    await unassignManagedUserPerson(2);
    assert.deepEqual(
      capture.calls.map(({ url, init }) => [init.method ?? "GET", url]),
      [
        ["GET", "/api/users/person-options?q=A+B"],
        ["PUT", "/api/users/2/person"],
        ["DELETE", "/api/users/2/person"]
      ]
    );
    assert.deepEqual(JSON.parse(String(capture.calls[1]?.init.body)), { personId: 12 });
  } finally {
    capture.restore();
  }
});
```

- [ ] **Step 3: Run route and client tests and verify failure**

Run:

```powershell
npx tsx --test scripts/user-management-routes.test.ts scripts/user-management-client-api.test.ts
```

Expected: FAIL because routes and client functions do not exist.

- [ ] **Step 4: Add route service typing and handlers**

Register static `/person-options` before parameterized routes:

```ts
router.get("/person-options", route(async (req, res) => {
  const rows = await service.listManagedUserPersonOptions(
    String(req.query.q ?? ""),
    actorFrom(req)
  );
  res.json({ rows });
}));

router.put("/:id/person", route(async (req, res) => {
  const personId = optionalInteger(req.body?.personId, "Person ID");
  if (personId == null) throw new UserManagementError("Person ID wajib diisi");
  const user = await service.assignManagedUserPerson(
    parseUserId(req), personId, actorFrom(req)
  );
  res.json({ user });
}));

router.delete("/:id/person", route(async (req, res) => {
  const user = await service.unassignManagedUserPerson(
    parseUserId(req), actorFrom(req)
  );
  res.json({ user });
}));
```

Add corresponding activity logs with actions `assign_user_person` and `unassign_user_person`. Use descriptions `Assigned person ID ${personId} to user "${user.username}"` and `Unassigned person from user "${user.username}"`; do not include email or authentication fields.

- [ ] **Step 5: Add typed client functions**

```ts
export async function fetchManagedUserPersonOptions(
  q = ""
): Promise<ManagedUserPersonOption[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const suffix = params.size ? `?${params}` : "";
  const body = await requestJson<{ rows: ManagedUserPersonOption[] }>(
    `/api/users/person-options${suffix}`
  );
  return body.rows;
}

export async function assignManagedUserPerson(
  userId: number,
  personId: number
): Promise<ManagedUser> {
  const body = await requestJson<{ user: ManagedUser }>(
    `/api/users/${userId}/person`,
    jsonInit("PUT", { personId })
  );
  return body.user;
}

export async function unassignManagedUserPerson(userId: number): Promise<ManagedUser> {
  const body = await requestJson<{ user: ManagedUser }>(
    `/api/users/${userId}/person`,
    jsonInit("DELETE")
  );
  return body.user;
}
```

- [ ] **Step 6: Run route/client tests and build**

Run:

```powershell
npx tsx --test scripts/user-management-routes.test.ts scripts/user-management-client-api.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the transport slice**

```powershell
git add src/server/routes/userRoutes.ts scripts/user-management-routes.test.ts src/client/api/userManagementApi.ts scripts/user-management-client-api.test.ts
git commit -m "feat: expose user person assignment api"
```

---

### Task 5: Protect linked people from deletion

**Files:**

- Create: `src/server/admin/peopleAdminService.ts`
- Create: `scripts/admin-people-link-protection.test.ts`
- Modify: `src/server/routes/adminRoutes.ts:1-114`
- Modify: `package.json`

**Interfaces:**

- Produces: `PeopleAdminError(message, statusCode, code, details)`.
- Produces: `deleteAdminPerson(personId): Promise<void>`.
- Produces error code `PERSON_LINKED_TO_USER` with `assignedUserId` and `assignedUsername`.
- Consumes: `app_users.person_id` from Task 1 and the existing admin route.

- [ ] **Step 1: Write failing service tests**

```ts
test("rejects deletion when a person is linked to an account", async () => {
  const db = new ScriptedDatabase([{ rows: [{ id: 2, username: "ALICE" }] }]);
  const service = createPeopleAdminService(db as any);
  await assert.rejects(
    () => service.deleteAdminPerson(12),
    (error: unknown) => error instanceof PeopleAdminError
      && error.statusCode === 409
      && error.code === "PERSON_LINKED_TO_USER"
      && error.details.assignedUsername === "ALICE"
  );
  assert.equal(db.calls.some((call) => /^DELETE FROM issue_people/i.test(call.text.trim())), false);
});

test("deletes an existing unlinked person and rejects a missing person", async () => {
  const successDb = new ScriptedDatabase([{ rows: [] }, { rows: [{ id: 12 }] }]);
  await createPeopleAdminService(successDb as any).deleteAdminPerson(12);
  assert.ok(successDb.calls.some((call) => /DELETE FROM issue_people/i.test(call.text)));

  const missingDb = new ScriptedDatabase([{ rows: [] }, { rows: [] }]);
  await assert.rejects(
    () => createPeopleAdminService(missingDb as any).deleteAdminPerson(99),
    (error: unknown) => error instanceof PeopleAdminError && error.statusCode === 404
  );
});
```

- [ ] **Step 2: Register and run the test to verify failure**

Add the file to `test:users`, then run:

```powershell
npx tsx --test scripts/admin-people-link-protection.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the focused delete service**

```ts
export class PeopleAdminError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "PeopleAdminError";
  }
}

export function createPeopleAdminService(database = pool) {
  async function deleteAdminPerson(personId: number): Promise<void> {
    const linked = await database.query(
      `SELECT id, username FROM app_users WHERE person_id = $1 ORDER BY id LIMIT 1`,
      [personId]
    );
    if (linked.rows[0]) {
      const owner = linked.rows[0];
      throw new PeopleAdminError(
        `Person masih terhubung ke akun ${owner.username}. Unassign akun terlebih dahulu.`,
        409,
        "PERSON_LINKED_TO_USER",
        { assignedUserId: Number(owner.id), assignedUsername: owner.username }
      );
    }
    const deleted = await database.query(
      `DELETE FROM issue_people WHERE id = $1 RETURNING id`,
      [personId]
    );
    if (!deleted.rows[0]) {
      throw new PeopleAdminError("Person tidak ditemukan", 404, "PERSON_NOT_FOUND");
    }
  }
  return { deleteAdminPerson };
}

export const { deleteAdminPerson } = createPeopleAdminService();
```

The foreign key remains the final race guard. If `DELETE` throws PostgreSQL code `23503`, translate it to the same `PERSON_LINKED_TO_USER` 409 response even if the pre-check saw no owner.

- [ ] **Step 4: Delegate the admin route and return safe errors**

Replace the direct delete with `deleteAdminPerson(id)`. In its catch block:

```ts
if (error instanceof PeopleAdminError) {
  res.status(error.statusCode).json({
    message: error.message,
    code: error.code,
    ...error.details
  });
  return;
}
next(error);
```

Keep the existing activity log after successful deletion only.

- [ ] **Step 5: Run focused and User Management tests**

Run:

```powershell
npx tsx --test scripts/admin-people-link-protection.test.ts scripts/user-management-person-assignment.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit deletion protection**

```powershell
git add src/server/admin/peopleAdminService.ts scripts/admin-people-link-protection.test.ts src/server/routes/adminRoutes.ts package.json
git commit -m "feat: protect linked people from deletion"
```

---

### Task 6: Render assignment state and confirmation UI

**Files:**

- Create: `src/client/components/users/UserPersonAssignmentDialog.tsx`
- Modify: `src/client/components/users/UserManagementWorkspace.tsx:42-112`
- Modify: `src/client/components/users/UserDetailPanel.tsx:4-103`
- Modify: `src/client/styles/user-management.css:112-260,330-470`
- Modify: `scripts/user-management-workspace.test.tsx`

**Interfaces:**

- Produces: `UserPersonAssignmentDialog` controlled component.
- Produces: list/detail states for unassigned, assigned-active, assigned-inactive, and archived-linked users.
- Consumes: `ManagedUser.person` and `ManagedUserPersonOption` from Task 2.

- [ ] **Step 1: Update fixtures and write failing markup tests**

Add `person: null` to base `ManagedUser` fixtures, then add:

```tsx
const linked = {
  ...inactive,
  person: {
    id: 12,
    fullName: "Alice Wijaya",
    nickname: "Alice",
    email: "alice@example.test",
    isActive: true
  }
};

test("renders linked identity and unassigned status in list and detail", () => {
  assert.match(view({ users: [admin, linked] }), /Alice Wijaya \(Alice\)/);
  assert.match(view({ users: [admin, inactive] }), /Unassigned/);
  const detail = renderToStaticMarkup(<UserDetailPanel
    user={linked}
    audit={[]}
    currentUserId={1}
    activeAdminCount={1}
    onAssignPerson={noop}
    onChangePerson={noop}
    onUnassignPerson={noop}
    onEdit={noop}
    onStatusChange={noop}
    onResetPassword={noop}
    onRevokeSessions={noop}
    onArchive={noop}
    onRestore={noop}
  />);
  assert.match(detail, /Linked Person/);
  assert.match(detail, /alice@example\.test/);
  assert.match(detail, /Change Assignment/);
});
```

Add dialog tests:

```tsx
test("assignment dialog disables inactive and owned people with explanations", () => {
  const html = renderToStaticMarkup(<UserPersonAssignmentDialog
    open
    user={inactive}
    query="ali"
    options={[
      { id: 12, fullName: "Inactive Person", nickname: "IP", email: null, isActive: false, assignedUser: null },
      { id: 13, fullName: "Owned Person", nickname: "OP", email: null, isActive: true,
        assignedUser: { id: 9, username: "BOB", deletedAt: null } }
    ]}
    selectedPersonId={null}
    phase="select"
    busy={false}
    error=""
    onQueryChange={noop}
    onSelect={noop}
    onContinue={noop}
    onBack={noop}
    onConfirm={noop}
    onClose={noop}
  />);
  assert.match(html, /Inactive Person[\s\S]*Inactive/);
  assert.match(html, /Owned Person[\s\S]*Assigned to BOB/);
  assert.equal((html.match(/disabled/g) ?? []).length >= 2, true);
});
```

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```powershell
npx tsx --test scripts/user-management-workspace.test.tsx
```

Expected: FAIL because linked-person props and the dialog do not exist.

- [ ] **Step 3: Add a single display-name formatter and list states**

Export a shared UI formatter from the dialog file:

```ts
export function managedPersonLabel(person: ManagedUserPerson): string {
  const fullName = person.fullName?.trim() ?? "";
  const nickname = person.nickname?.trim() ?? "";
  if (fullName && nickname) return `${fullName} (${nickname})`;
  return fullName || nickname || `Person #${person.id}`;
}
```

Use it in user rows. Under the username, render either the label or `Unassigned`; render an `Inactive person` badge when `user.person && !user.person.isActive`. Change the search placeholder to `Search username, full name, or nickname`.

- [ ] **Step 4: Add the Linked Person detail section**

Extend `UserDetailPanel` props with `onAssignPerson`, `onChangePerson`, and `onUnassignPerson`. Render:

```tsx
<section className="user-detail__person" aria-labelledby="linked-person-title">
  <h3 id="linked-person-title">Linked Person</h3>
  {user.person ? <>
    <dl>
      <div><dt>Full name</dt><dd>{user.person.fullName ?? "-"}</dd></div>
      <div><dt>Nickname</dt><dd>{user.person.nickname ?? "-"}</dd></div>
      <div><dt>Email</dt><dd>{user.person.email ?? "-"}</dd></div>
      <div><dt>Person status</dt><dd>{user.person.isActive ? "Active" : "Inactive"}</dd></div>
    </dl>
    {!user.deletedAt && <div className="user-detail__person-actions">
      <button type="button" className="button" onClick={onChangePerson}>Change Assignment</button>
      <button type="button" className="button button--danger" onClick={onUnassignPerson}>Unassign</button>
    </div>}
  </> : <>
    <p>No person assigned to this account.</p>
    {!user.deletedAt && <button type="button" className="button button--primary" onClick={onAssignPerson}>Assign Person</button>}
  </>}
</section>
```

- [ ] **Step 5: Implement the controlled select/confirm dialog**

Define the controlled interface explicitly:

```ts
type Props = {
  open: boolean;
  user: ManagedUser;
  query: string;
  options: ManagedUserPersonOption[];
  selectedPersonId: number | null;
  phase: "select" | "confirm";
  operation?: "assign" | "unassign";
  busy: boolean;
  error: string;
  onQueryChange(value: string): void;
  onSelect(personId: number): void;
  onContinue(): void;
  onBack(): void;
  onConfirm(): void;
  onClose(): void;
};
```

Use two explicit phases: `select` and `confirm`. Candidate availability is:

```ts
function optionDisabled(option: ManagedUserPersonOption, user: ManagedUser): boolean {
  if (!option.isActive) return true;
  return option.assignedUser != null && option.assignedUser.id !== user.id;
}
```

In `select`, render search input, candidate buttons, current marker, inactive reason, and `Assigned to <username>`. In `confirm`, render exactly one of:

```ts
const transition = user.person
  ? `${managedPersonLabel(user.person)} -> ${managedPersonLabel(selected)}`
  : `${user.username} -> ${managedPersonLabel(selected)}`;
```

For unassignment, the workspace will open `confirm` with no selected candidate and the dialog renders `${managedPersonLabel(user.person!)} -> Unassigned`.

- [ ] **Step 6: Add responsive and state styling**

Add focused classes:

```css
.user-management__identity { display: grid; gap: 0.15rem; }
.user-badge--unassigned { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
.user-badge--person-warning { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
.user-detail__person { margin-top: 1rem; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 10px; }
.user-detail__person dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
.user-detail__person-actions { display: flex; gap: 0.65rem; flex-wrap: wrap; }
.user-person-options { display: grid; gap: 0.5rem; max-height: 20rem; overflow-y: auto; }
.user-person-option { width: 100%; padding: 0.75rem; text-align: left; }
.user-person-option[disabled] { cursor: not-allowed; opacity: 0.6; }
.user-person-transition { padding: 1rem; border-radius: 10px; background: #f8fafc; }
```

At the existing `820px` breakpoint, change `.user-detail__person dl` to one column.

- [ ] **Step 7: Run markup tests and visual CSS contracts**

Run:

```powershell
npx tsx --test scripts/user-management-workspace.test.tsx
node scripts/visual-consistency-contract.test.mjs
node scripts/typography-contract.test.mjs
```

Expected: all commands PASS.

- [ ] **Step 8: Commit the presentational UI slice**

```powershell
git add src/client/components/users/UserPersonAssignmentDialog.tsx src/client/components/users/UserManagementWorkspace.tsx src/client/components/users/UserDetailPanel.tsx src/client/styles/user-management.css scripts/user-management-workspace.test.tsx
git commit -m "feat: render user person assignment controls"
```

---

### Task 7: Wire assignment orchestration and verify the enhancement

**Files:**

- Modify: `src/client/components/users/UserManagementWorkspace.tsx:127-356`
- Modify: `scripts/user-management-workspace.test.tsx`
- Modify: `README.md`

**Interfaces:**

- Produces: `runPersonAssignmentMutation(api, userId, personId): Promise<{ user; audit }>` for deterministic orchestration tests.
- Consumes: client API from Task 4 and dialog from Task 6.
- Preserves: selected user ID after success and refreshes list plus audit.

- [ ] **Step 1: Write failing orchestration tests**

Export and test a small async coordinator instead of introducing a browser-test dependency:

```ts
test("assignment coordinator mutates then reloads audit", async () => {
  const calls: string[] = [];
  const api = {
    assignManagedUserPerson: async (userId: number, personId: number) => {
      calls.push(`assign:${userId}:${personId}`);
      return linked;
    },
    unassignManagedUserPerson: async (userId: number) => {
      calls.push(`unassign:${userId}`);
      return { ...linked, person: null };
    },
    fetchManagedUserAudit: async (userId: number) => {
      calls.push(`audit:${userId}`);
      return [];
    }
  };

  const assigned = await runPersonAssignmentMutation(api as any, 2, 12);
  assert.equal(assigned.user.person?.id, 12);
  assert.deepEqual(calls, ["assign:2:12", "audit:2"]);

  calls.length = 0;
  const unassigned = await runPersonAssignmentMutation(api as any, 2, null);
  assert.equal(unassigned.user.person, null);
  assert.deepEqual(calls, ["unassign:2", "audit:2"]);
});
```

- [ ] **Step 2: Run the workspace test and verify failure**

Run:

```powershell
npx tsx --test scripts/user-management-workspace.test.tsx
```

Expected: FAIL because `runPersonAssignmentMutation` is not exported.

- [ ] **Step 3: Implement the deterministic mutation coordinator**

```ts
type PersonAssignmentApi = Pick<Api,
  "assignManagedUserPerson" |
  "unassignManagedUserPerson" |
  "fetchManagedUserAudit"
>;

export async function runPersonAssignmentMutation(
  api: PersonAssignmentApi,
  userId: number,
  personId: number | null
) {
  const user = personId == null
    ? await api.unassignManagedUserPerson(userId)
    : await api.assignManagedUserPerson(userId, personId);
  const audit = await api.fetchManagedUserAudit(userId);
  return { user, audit };
}
```

- [ ] **Step 4: Add dialog state and candidate loading**

Use one state object:

```ts
type PersonDialogState = {
  user: ManagedUser;
  query: string;
  options: ManagedUserPersonOption[];
  selectedPersonId: number | null;
  phase: "select" | "confirm";
  operation: "assign" | "unassign";
};
```

When opening assign/change, initialize `phase: "select"`, load `api.fetchManagedUserPersonOptions("")`, and reload on query changes with stale-response cancellation. When opening unassign, initialize `phase: "confirm"` and `operation: "unassign"` without loading candidates.

- [ ] **Step 5: Wire successful mutation, selection preservation, and error behavior**

On confirmation:

```ts
const personId = personDialog.operation === "unassign"
  ? null
  : personDialog.selectedPersonId;
if (personDialog.operation === "assign" && personId == null) return;

const result = await runPersonAssignmentMutation(
  api,
  personDialog.user.id,
  personId
);
setAudit(result.audit);
setSelectedUserId(result.user.id);
setNotice(personId == null
  ? "Assignment person berhasil dilepas."
  : "Assignment person berhasil diperbarui.");
setPersonDialog(null);
await loadUsers(result.user.id);
```

Change `loadUsers` to accept an optional preferred ID and select it when still present:

```ts
const loadUsers = useCallback(async (preferredUserId?: number) => {
  setLoading(true);
  setError("");
  try {
    const result = await api.fetchManagedUsers({
      q: filters.q || undefined,
      role: (filters.role || undefined) as ManagedUserListFilters["role"],
      status: (filters.status || undefined) as ManagedUserListFilters["status"],
      scope,
      pageSize: 100
    });
    setUsers(result.users);
    setSelectedUserId((previous) => {
      const wanted = preferredUserId ?? previous;
      return wanted != null && result.users.some((user) => user.id === wanted)
        ? wanted
        : result.users[0]?.id ?? null;
    });
  } catch (nextError) {
    setError(nextError instanceof Error ? nextError.message : "Gagal memuat user");
    setUsers([]);
    setSelectedUserId(null);
  } finally {
    setLoading(false);
  }
}, [api, filters, scope]);
```

Keep the dialog open with `dialogError` when a request fails. Do not discard its query or selected candidate.

- [ ] **Step 6: Document the ADMIN workflow**

Add a concise README section:

```markdown
### User-to-person assignment

ADMIN can open User Management, select a current account, and use **Assign Person**, **Change Assignment**, or **Unassign**. Accounts may remain unassigned. Only active people can be selected, and one person can belong to only one account. Archived accounts keep their link but must be restored before it can change.
```

- [ ] **Step 7: Run the full User Management suite**

Run:

```powershell
npm run test:users
```

Expected: schema, auth, lifecycle, assignment, deletion protection, route, client, and UI tests all PASS.

- [ ] **Step 8: Run full regression and production build**

Run:

```powershell
npm test
npm run build
```

Expected: all test groups PASS and TypeScript/Vite build completes without errors.

- [ ] **Step 9: Perform manual acceptance checks against a migrated development database**

Verify, in order:

1. An existing account displays `Unassigned` and can still log in.
2. Searching by full name and nickname finds the same person.
3. Assigning an active person updates list, detail, and audit without losing user selection.
4. The assigned person is disabled for every other account and identifies its owning username.
5. Reassignment confirmation displays old and new names; audit records `PERSON_REASSIGNED`.
6. Unassignment confirmation displays the person and `Unassigned`; the person becomes available elsewhere.
7. An inactive candidate cannot be selected.
8. A linked person changed to inactive remains linked and shows a warning.
9. Archiving and restoring an account preserves its person link.
10. Deleting a linked person returns a clear conflict; deletion succeeds after unassignment.

- [ ] **Step 10: Commit orchestration and documentation**

```powershell
git add src/client/components/users/UserManagementWorkspace.tsx scripts/user-management-workspace.test.tsx README.md
git commit -m "feat: complete user person assignment workflow"
```

---

## Final Review Checklist

- Every acceptance criterion in `docs/superpowers/specs/2026-08-10-user-person-assignment-design.md` maps to a task above.
- No account-creation UI or payload includes `personId`.
- No automatic matching or backfill exists.
- No API response or audit metadata includes password hashes, session tokens, or secrets.
- Both application pre-checks and database constraints protect assignment/deletion races.
- Existing unrelated workspace changes remain untouched and are excluded from every commit.
