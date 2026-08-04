# Transport Lifecycle Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct stale QA/PRD lifecycle records and guarantee that only valid SAP `TPALOG` step `I` evidence can mark a CR imported.

**Architecture:** Add an auditable `transport_step` field and database guard, isolate step-I validation in a pure policy module, and run legacy reconciliation through a dependency-injected service shared by full sync and a deployment CLI. Cache refresh may maintain pending placeholders but cannot promote target-cache matches to imported or overwrite unresolved legacy evidence.

**Tech Stack:** TypeScript, Node.js, PostgreSQL, node-rfc SAP discovery, Node test runner, tsx.

## Global Constraints

- DEV is the source for creation and release; QA and PRD are independent import targets.
- Only `TPALOG.TRSTEP = 'I'` may create confirmed imported lifecycle evidence.
- Valid historical step-I evidence is never downgraded because E070/SE03 is later empty.
- SAP query failure preserves the existing row and records a reconciliation failure.
- `TRDK924576` must be corrected by the general reconciliation path, not a CR-specific exception.
- Preserve all unrelated dirty-worktree changes. Do not stage or commit implementation files unless the user separately requests it.

---

### Task 1: Add Transport-Step Schema Guard

**Files:**
- Create: `database/migrations/20260804_transport_lifecycle_step.sql`
- Modify: `database/schema.sql`
- Create: `scripts/cr-lifecycle-schema-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: nullable `cr_transport_lifecycle.transport_step TEXT`.
- Produces: `chk_cr_transport_lifecycle_confirmed_step` as a `NOT VALID` check constraint enforced for new and updated rows.

- [ ] **Step 1: Write the failing schema contract test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../database/migrations/20260804_transport_lifecycle_step.sql", import.meta.url),
  "utf8"
);
const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");

test("adds an auditable transport step and guards confirmed imports", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS transport_step TEXT/i);
    assert.match(sql, /chk_cr_transport_lifecycle_confirmed_step/i);
    assert.match(sql, /transport_step\s*=\s*'I'/i);
    assert.match(sql, /NOT VALID/i);
  }
});

test("backfills legacy TPALOG step messages", () => {
  assert.match(migration, /Confirmed from TPALOG step/i);
  assert.match(migration, /regexp_match/i);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node scripts/cr-lifecycle-schema-contract.test.mjs`

Expected: FAIL because the migration and column do not exist.

- [ ] **Step 3: Add the idempotent schema and migration SQL**

Use the following contract in both the migration and `database/schema.sql`:

```sql
ALTER TABLE cr_transport_lifecycle
  ADD COLUMN IF NOT EXISTS transport_step TEXT;

UPDATE cr_transport_lifecycle
SET transport_step = upper((regexp_match(message, 'Confirmed from TPALOG step ([A-Za-z])', 'i'))[1])
WHERE transport_step IS NULL
  AND message ~* 'Confirmed from TPALOG step [A-Za-z]';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_cr_transport_lifecycle_confirmed_step'
      AND conrelid = 'cr_transport_lifecycle'::regclass
  ) THEN
    ALTER TABLE cr_transport_lifecycle
      ADD CONSTRAINT chk_cr_transport_lifecycle_confirmed_step
      CHECK (
        NOT (evidence_source = 'confirmed' AND transport_status = 'imported')
        OR transport_step = 'I'
      ) NOT VALID;
  END IF;
END $$;
```

- [ ] **Step 4: Register and run the schema test**

Add `node scripts/cr-lifecycle-schema-contract.test.mjs` to `test:baseline` before TypeScript tests.

Run: `node scripts/cr-lifecycle-schema-contract.test.mjs`

Expected: PASS.

---

### Task 2: Enforce Step-I Import Policy at the Repository Boundary

**Files:**
- Create: `src/server/sync/transportLifecyclePolicy.ts`
- Create: `scripts/cr-lifecycle-import-policy.test.ts`
- Modify: `src/server/db/crRepository.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeTransportStep(step?: string): string`.
- Produces: `isConfirmedImportLog(log: TransportImportLog): boolean`.
- Produces: `dedupeLatestConfirmedImportLogs(logs: TransportImportLog[]): { accepted: TransportImportLog[]; rejected: TransportImportLog[] }`.
- Changes: `upsertConfirmedTransportLogs()` returns `{ processed, orphanLogs, rejectedLogs }`.

- [ ] **Step 1: Write failing policy tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeLatestConfirmedImportLogs,
  isConfirmedImportLog
} from "../src/server/sync/transportLifecyclePolicy.js";

test("accepts only normalized TPALOG import steps", () => {
  assert.equal(isConfirmedImportLog({ trkorr: "TRDK924576", step: " I " }), true);
  assert.equal(isConfirmedImportLog({ trkorr: "TRDK924576", step: "U" }), false);
  assert.equal(isConfirmedImportLog({ trkorr: "TRDK924576" }), false);
});

test("never falls back to a non-import step", () => {
  const result = dedupeLatestConfirmedImportLogs([
    { trkorr: "TRDK924576", step: "U", timestamp: "20260624122022" },
    { trkorr: "TRDK924576", step: "I", timestamp: "20260623163304" },
    { trkorr: "TRDK924580", step: "U", timestamp: "20260625120000" }
  ]);
  assert.deepEqual(result.accepted.map((row) => row.trkorr), ["TRDK924576"]);
  assert.deepEqual(result.rejected.map((row) => row.trkorr), ["TRDK924576", "TRDK924580"]);
});
```

- [ ] **Step 2: Run the policy test and verify it fails**

Run: `npx tsx --test scripts/cr-lifecycle-import-policy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the pure policy module**

The implementation must filter to valid request IDs and step `I`, select the latest valid import per request, and return every non-I row in `rejected`. It must not use the existing fallback that selects any step when no `I` row exists.

```ts
export function normalizeTransportStep(step?: string) {
  return String(step || "").trim().toUpperCase();
}

export function isConfirmedImportLog(log: TransportImportLog) {
  return isTransportRequestId(log.trkorr) && normalizeTransportStep(log.step) === "I";
}
```

- [ ] **Step 4: Apply the policy inside `upsertConfirmedTransportLogs`**

Replace `dedupeLatestTransportLogs(logs)` with `dedupeLatestConfirmedImportLogs(logs).accepted`. Persist `transport_step` on insert and conflict update:

```sql
INSERT INTO cr_transport_lifecycle (..., return_code, transport_step, message, ...)
VALUES (..., $7, 'I', $8, ...)
ON CONFLICT (...) DO UPDATE SET
  ...,
  transport_step = EXCLUDED.transport_step,
  ...
```

Return rejected rows to the caller:

```ts
return { processed, orphanLogs, rejectedLogs };
```

- [ ] **Step 5: Run the focused tests**

Run: `npx tsx --test scripts/cr-lifecycle-import-policy.test.ts`

Expected: PASS.

---

### Task 3: Make Cache Refresh Pending-Only and Add Reconciliation Queries

**Files:**
- Modify: `src/server/db/crRepository.ts`
- Create: `scripts/cr-lifecycle-repository-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `LegacyTransportLifecycleCandidate` with `trkorr`, `target_system_code`, and `transport_step`.
- Produces: `listLegacyTransportLifecycleCandidates(targetSystemCode, limit)`.
- Produces: `downgradeLegacyTransportLifecycle(targetSystemCode, trkorr, message)`.
- Produces: `countLegacyTransportLifecycleCandidates()`.
- Produces: `validateConfirmedTransportStepConstraint()`.

- [ ] **Step 1: Write a failing repository source-contract test**

The test reads `src/server/db/crRepository.ts` and asserts:

```js
assert.match(source, /transport_step\s+IS\s+NULL[\s\S]+transport_step\s*<>\s*'I'/i);
assert.match(source, /SET\s+transport_status\s*=\s*'pending'[\s\S]+evidence_source\s*=\s*'unknown'/i);
assert.match(source, /VALIDATE CONSTRAINT chk_cr_transport_lifecycle_confirmed_step/i);
assert.doesNotMatch(cacheRefreshBlock, /target\.trkorr IS NULL THEN 'pending' ELSE 'imported'/i);
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `node scripts/cr-lifecycle-repository-contract.test.mjs`

Expected: FAIL against the current inferred-import cache SQL.

- [ ] **Step 3: Change cache refresh to pending-only**

The insert side creates `pending/unknown` placeholders regardless of target-cache header presence. The conflict update must:

- preserve valid `confirmed/imported/step I` rows;
- update ordinary non-confirmed rows to pending;
- skip unresolved legacy confirmed rows entirely using a `DO UPDATE ... WHERE` guard so the not-valid constraint does not reject the statement.

Target-cache presence may remain in the diagnostic message but cannot set `transport_status = 'imported'`.

- [ ] **Step 4: Add legacy candidate and downgrade queries**

Candidate selection:

```sql
WHERE source_system_code = 'DEV'
  AND target_system_code = $1
  AND evidence_source = 'confirmed'
  AND transport_status = 'imported'
  AND (transport_step IS NULL OR transport_step <> 'I')
```

Downgrade atomically:

```sql
UPDATE cr_transport_lifecycle
SET transport_status = 'pending',
    evidence_source = 'unknown',
    transport_step = NULL,
    imported_at = NULL,
    import_date = NULL,
    import_time = NULL,
    return_code = NULL,
    message = $3,
    last_checked_at = now(),
    updated_at = now()
WHERE source_system_code = 'DEV'
  AND target_system_code = $1
  AND trkorr = $2
  AND evidence_source = 'confirmed'
  AND transport_status = 'imported'
  AND (transport_step IS NULL OR transport_step <> 'I')
```

- [ ] **Step 5: Add constraint validation helpers and run tests**

Validate only when `countLegacyTransportLifecycleCandidates()` returns zero.

Run: `node scripts/cr-lifecycle-repository-contract.test.mjs && npx tsx --test scripts/cr-lifecycle-import-policy.test.ts`

Expected: PASS.

---

### Task 4: Reconcile Legacy Rows Independently on QA and PRD

**Files:**
- Create: `src/server/sync/transportLifecycleReconciler.ts`
- Create: `scripts/cr-lifecycle-reconciliation.test.ts`

**Interfaces:**
- Produces: `reconcileLegacyTransportLifecycle(options: { targetSystemCodes: Array<"QA" | "PRD">; limitPerTarget: number; dryRun?: boolean }, dependencies)`.
- Consumes: repository candidate/upsert/downgrade/constraint helpers from Task 3.
- Consumes: `readTransportImportLogsByRequest()` from `crExtractor.ts`.

- [ ] **Step 1: Write failing service tests with injected dependencies**

Cover these exact scenarios:

```ts
test("keeps QA imported and downgrades PRD when only QA has step I", async () => {
  // candidates: QA legacy + PRD legacy for TRDK924576
  // SAP result: QA [{ step: "I" }], PRD []
  // assert QA upserted, PRD downgraded, no hard-coded CR branch
});

test("preserves unresolved legacy evidence when SAP throws", async () => {
  // SAP reader throws
  // assert downgrade is not called and failures === 1
});

test("does not recheck valid historical step-I rows", async () => {
  // candidate list empty
  // assert SAP reader is never called
});
```

- [ ] **Step 2: Run the reconciliation test and verify it fails**

Run: `npx tsx --test scripts/cr-lifecycle-reconciliation.test.ts`

Expected: FAIL because the reconciler does not exist.

- [ ] **Step 3: Implement the dependency-injected reconciler**

Use this result shape per target:

```ts
type LifecycleReconciliationResult = {
  targetSystemCode: "QA" | "PRD";
  candidates: number;
  confirmed: number;
  downgraded: number;
  failed: number;
};
```

For each target and candidate:

- query exact live step-I logs;
- call `upsertConfirmedTransportLogs` when a valid row exists;
- otherwise call `downgradeLegacyTransportLifecycle`;
- catch per-candidate SAP errors without downgrading;
- when `dryRun` is true, calculate decisions without calling upsert, downgrade, or constraint-validation dependencies;
- validate the constraint only when no unresolved candidate remains across both targets.

- [ ] **Step 4: Run focused policy and reconciler tests**

Run: `npx tsx --test scripts/cr-lifecycle-import-policy.test.ts scripts/cr-lifecycle-reconciliation.test.ts`

Expected: PASS.

---

### Task 5: Integrate Reconciliation into Full Sync and Deployment CLI

**Files:**
- Modify: `src/server/sync/crSyncRunner.ts`
- Create: `scripts/reconcile-transport-lifecycle.ts`
- Create: `scripts/cr-sync-lifecycle-reconciliation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Adds npm command: `sap:reconcile-lifecycle`.
- Extends `RunCrSyncResult.lifecycleResults` with `rejectedNonImportRows`, `legacyCandidates`, `legacyConfirmed`, `legacyDowngraded`, and reconciliation failure counts.

- [ ] **Step 1: Write failing sync integration tests**

Assert that:

- repository-rejected non-I rows are included in the QA/PRD sync summary;
- full-period sync invokes legacy reconciliation for selected QA and PRD targets;
- incremental sync does not audit already valid historical records;
- one target failure does not suppress the other target result.

- [ ] **Step 2: Run the sync test and verify it fails**

Run: `npx tsx --test scripts/cr-sync-lifecycle-reconciliation.test.ts`

Expected: FAIL because the result fields and reconciler call are absent.

- [ ] **Step 3: Integrate the service into `runCrSync`**

After normal QA/PRD TPALOG ingestion and pending-placeholder refresh:

```ts
if (syncMode === "full_period") {
  const reconciliation = await reconcileLegacyTransportLifecycle({
    targetSystemCodes: ["QA", "PRD"].filter((code) => systemCodes.includes(code)),
    limitPerTarget: Math.min(config.orphanRecovery.maxPerSync, 200)
  });
  // map results into lifecycleResults
}
```

Do not use a missing log from the period-wide incremental query to downgrade any existing confirmed record.

- [ ] **Step 4: Add a standalone deployment CLI**

`scripts/reconcile-transport-lifecycle.ts` defaults to both QA and PRD, accepts `--dry-run`, and prints JSON counts without credentials. Add:

```json
"sap:reconcile-lifecycle": "tsx scripts/reconcile-transport-lifecycle.ts"
```

Dry-run lists candidate counts and live decisions without database updates. Apply mode performs updates and conditionally validates the constraint.

- [ ] **Step 5: Run all lifecycle tests**

Run:

```powershell
node scripts/cr-lifecycle-schema-contract.test.mjs
node scripts/cr-lifecycle-repository-contract.test.mjs
npx tsx --test scripts/cr-lifecycle-import-policy.test.ts scripts/cr-lifecycle-reconciliation.test.ts scripts/cr-sync-lifecycle-reconciliation.test.ts
```

Expected: all tests PASS.

---

### Task 6: Apply Schema and Correct Live QA/PRD Data

**Files:**
- No new files; execute the tested schema and CLI.

**Interfaces:**
- Consumes: `npm run db:schema` and `npm run sap:reconcile-lifecycle`.
- Produces: corrected lifecycle cache for all legacy-risk records on QA and PRD.

- [ ] **Step 1: Pause the backend during the schema transition**

Resolve the exact process listening on port 3001 and stop only that PID. This prevents the previous application version from running cache refresh while the new write constraint is already active.

- [ ] **Step 2: Apply the idempotent schema**

Run: `npm run db:schema`

Expected: JSON response with `ok: true` and `database/schema.sql` applied.

- [ ] **Step 3: Run read-only reconciliation preview**

Run: `npm run sap:reconcile-lifecycle -- --dry-run`

Expected: QA and PRD candidate/confirmed/downgrade/failure counts, including a PRD downgrade decision for `TRDK924576`.

- [ ] **Step 4: Execute reconciliation on both targets**

Run: `npm run sap:reconcile-lifecycle`

Expected: successful per-target JSON summary. A failed SAP query remains unresolved and is not downgraded.

- [ ] **Step 5: Verify TRDK924576 from database and live SAP**

Database assertions:

- QA: `transport_status = 'imported'`, `evidence_source = 'confirmed'`, `transport_step = 'I'`.
- PRD: `transport_status = 'pending'`, `evidence_source = 'unknown'`, import metadata null.
- Derived application lifecycle: `pending_prd` / `Pending to PRD`.

Live assertions:

- QA targeted TPALOG query returns step `I`.
- PRD targeted TPALOG query returns no step `I`.

---

### Task 7: Full Verification and Service Restart

**Files:**
- No new files.

- [ ] **Step 1: Run the complete regression suite**

Run: `npm test`

Expected: exit code 0 with no failed tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build exit code 0.

- [ ] **Step 3: Restart backend and verify health**

Restart only the process listening on port 3001, then verify:

- `GET /` returns HTTP 200.
- `GET /api/auth/me` without a session returns HTTP 401.

- [ ] **Step 4: Verify the application UI**

In CR Transport Report, search `TRDK924576` and confirm:

- status badge is `Pending to PRD`;
- lifecycle contains Created, Released, and In QA;
- lifecycle does not contain In PRD;
- browser console contains no new errors.
