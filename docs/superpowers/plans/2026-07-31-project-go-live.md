# Project Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Project prototype with a persistent, audited Project feature that supports report, create, change, add/remove Issue, cancel, and admin-only delete.

**Architecture:** Introduce normalized Project header, current Issue relationship, immutable relationship history, and status history tables. Add a transaction-oriented repository and authenticated REST API, then replace mock frontend state with API-backed report/editor components. Project document generation remains outside this release.

**Tech Stack:** PostgreSQL, Node.js, Express, TypeScript, React 19, CSS, Node test runner, Vite.

## Global Constraints

- One Issue can belong to at most one active Project.
- Cancelling or deleting a Project never changes or deletes an Issue or SAP CR.
- A linked Issue must be removed from its active Project before the Issue can be hard-deleted.
- Cancelling an Issue keeps its Project relationship until Change Project explicitly removes it.
- Cancel releases active Issue relationships and preserves historical relationships.
- Project Owner comes from `issue_people`; audit actors come from `app_users`.
- `USER` and `ADMIN` can create, change, and cancel; only `ADMIN` can delete.
- Project CR Transport generation and template sandbox are excluded.
- Existing mock Projects are not automatically inserted into production.
- Every production change follows RED-GREEN-REFACTOR and preserves existing Issue/CR behavior.

---

### Task 1: Project domain types and pure rules

**Files:**
- Create: `src/shared/projectTypes.ts`
- Create: `src/server/projects/projectDomain.ts`
- Create: `scripts/project-domain.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `ProjectStatus`, `ProjectRow`, `ProjectDetail`, `ProjectIssueOption`, `ProjectFilters`, `ProjectListResult`, and `ProjectSavePayload`.
- Produces `validateProjectPayload(payload)`, `diffIssueLinks(currentIds, nextIds)`, and `assertProjectTransition(current, next)`.

- [ ] **Step 1: Write failing domain tests**

Cover required name/owner, allowed statuses, rejection of direct `cancelled` saves, deduplication of Issue IDs, deterministic added/removed link diff, and cancelled-to-edit transition rejection.

- [ ] **Step 2: Run RED**

Run:

```powershell
cmd.exe /c npx tsx --test scripts\project-domain.test.ts
```

Expected: failure because `projectTypes.ts` and `projectDomain.ts` do not exist.

- [ ] **Step 3: Implement minimal types and pure rules**

Use this status union:

```ts
export type ProjectStatus = "planned" | "in_progress" | "on_hold" | "completed" | "cancelled";
```

`validateProjectPayload` returns a normalized payload and throws descriptive `Error` instances. `diffIssueLinks` returns sorted unique `{ added, removed }` arrays.

- [ ] **Step 4: Run GREEN and add the test to `npm test`**

Run the targeted test, then `cmd.exe /c npm test`.

Expected: all tests pass.

---

### Task 2: Additive Project schema

**Files:**
- Modify: `database/schema.sql`
- Create: `scripts/project-schema-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `project_headers`, `project_issue_links`, `project_issue_link_history`, and `project_status_history`.
- Produces indexes for Project key, status, owner, active Issue uniqueness, and history lookup.

- [ ] **Step 1: Write failing schema contract**

Read `database/schema.sql` and assert exact table names, allowed status checks, actor FKs, Issue uniqueness, history statuses, and `ON DELETE SET NULL` history behavior.

- [ ] **Step 2: Run RED**

```powershell
cmd.exe /c node scripts\project-schema-contract.test.mjs
```

Expected: failure on the first missing Project table.

- [ ] **Step 3: Add idempotent schema SQL**

Append `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` where required, constraints, and indexes. Do not alter existing Issue or CR rows.

- [ ] **Step 4: Run GREEN**

Run the targeted contract and full `npm test`.

- [ ] **Step 5: Validate against a disposable database schema**

Apply `database/schema.sql` to a temporary PostgreSQL database or isolated schema, run it twice to prove idempotency, query `pg_constraint` and `pg_indexes`, then drop only the disposable schema.

Expected: both applications succeed and all expected constraints/indexes exist.

---

### Task 3: Project repository read operations

**Files:**
- Create: `src/server/db/projectRepository.ts`
- Create: `scripts/project-repository-read.test.ts`

**Interfaces:**
- Consumes Project types from Task 1 and tables from Task 2.
- Produces:

```ts
listProjects(filters: ProjectFilters): Promise<ProjectListResult>
getProjectDetail(id: number): Promise<ProjectDetail>
searchProjectIssueOptions(query: string, excludeProjectId?: number): Promise<ProjectIssueOption[]>
```

- [ ] **Step 1: Write failing repository integration tests**

Seed Projects, active/historical links, Issues, people, and CR links in a disposable schema. Assert pagination, status/search filters, list counts, detail history, and Issue option ownership labels.

- [ ] **Step 2: Run RED**

Run:

```powershell
cmd.exe /c npx tsx --test scripts\project-repository-read.test.ts
```

Expected: failure because repository exports do not exist.

- [ ] **Step 3: Implement parameterized read queries**

Return active Issue links for editable Projects and history rows for cancelled Projects. Issue option search covers Issue key, name, requester snapshot, ABAPer snapshot, and CR number.

- [ ] **Step 4: Run GREEN**

Run targeted and full tests.

---

### Task 4: Transactional create and change

**Files:**
- Modify: `src/server/db/projectRepository.ts`
- Create: `scripts/project-repository-write.test.ts`

**Interfaces:**
- Produces:

```ts
saveProject(payload: ProjectSavePayload, actor: AuthUser): Promise<ProjectDetail>
```

- [ ] **Step 1: Write failing transaction tests**

Assert automatic `PRJ-YYNNN` numbering, owner validation, actor snapshots, add/remove history, status history, rollback on conflicting Issue, and concurrent rejection when two Projects select the same Issue.

- [ ] **Step 2: Run RED**

Run the targeted repository write test and confirm missing behavior failures.

- [ ] **Step 3: Implement `saveProject`**

Use `BEGIN`, a transaction advisory lock for numbering, `SELECT ... FOR UPDATE` on selected Issues, conflict lookup in `project_issue_links`, current-link replacement, history writes, and `COMMIT`/`ROLLBACK`.

- [ ] **Step 4: Run GREEN**

Run targeted tests and `npm test`.

---

### Task 5: Cancel and admin delete repository behavior

**Files:**
- Modify: `src/server/db/projectRepository.ts`
- Modify: `src/server/db/issueRepository.ts`
- Create: `scripts/project-lifecycle.test.ts`

**Interfaces:**
- Produces:

```ts
cancelProject(id: number, reason: string, actor: AuthUser): Promise<ProjectDetail>
deleteProject(id: number, actor: AuthUser): Promise<{ ok: true; id: number }>
```

- [ ] **Step 1: Write failing lifecycle tests**

Assert cancel reason requirement, terminal/read-only state, release of current links, preservation of cancelled history, ability to link the released Issue to another Project, delete preservation of history snapshots, no Issue deletion, linked-Issue hard-delete rejection with the owning Project key, and retention of the Project relationship when an Issue is cancelled.

- [ ] **Step 2: Run RED**

Run the lifecycle test and confirm the missing exports/behavior fail.

- [ ] **Step 3: Implement transactional lifecycle methods**

Cancel updates the header and status history, closes active relationship history as `cancelled`, and deletes current links. Delete closes links as `deleted`, deletes the header, and relies on snapshot history with nullable FKs. Before hard-deleting an Issue, `deleteIssue` queries `project_issue_links` joined to `project_headers` and raises a conflict containing the owning `project_key`; Issue cancellation does not alter Project links.

- [ ] **Step 4: Run GREEN**

Run targeted tests and the full suite.

---

### Task 6: Authenticated Project API

**Files:**
- Create: `src/server/routes/projectRoutes.ts`
- Modify: `src/server/index.ts`
- Create: `scripts/project-routes.test.ts`

**Interfaces:**
- Consumes repository functions from Tasks 3-5 and `requireAuth`/`requireAdmin`.
- Produces `/api/projects` list/detail/options/create/update/cancel/delete endpoints.

- [ ] **Step 1: Write failing route tests**

Assert `401` unauthenticated, correct list/detail payloads, actor identity sourced from the session, Project assignment and linked-Issue delete `409` conflict mapping, cancel reason validation, `403` non-admin delete, and successful admin delete.

- [ ] **Step 2: Run RED**

Run the route test and confirm the Project routes return missing-route failures.

- [ ] **Step 3: Implement route handlers**

Mount `projectRoutes` behind authentication. Apply `requireAdmin` specifically to `DELETE /:id`. Do not accept audit actor fields from request bodies.

- [ ] **Step 4: Run GREEN**

Run targeted route tests and full tests.

---

### Task 7: Client API and mock removal

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/pages/App.tsx`
- Create: `scripts/project-api-contract.test.ts`

**Interfaces:**
- Produces `fetchProjects`, `fetchProjectDetail`, `fetchProjectIssueOptions`, `saveProject`, `cancelProject`, and `deleteProject`.
- Removes `projectMockData` as the Project Report data source.

- [ ] **Step 1: Write failing client contract tests**

Assert URL, method, body, download-free Project API surface, and absence of `projectMockData` after implementation.

- [ ] **Step 2: Run RED**

Run the targeted test and confirm missing API exports.

- [ ] **Step 3: Implement client API functions and wire application state**

Preserve existing authentication/error handling conventions. Do not add a Project document endpoint or Generate button.

- [ ] **Step 4: Run GREEN**

Run targeted and full tests.

---

### Task 8: Project Report with real data

**Files:**
- Create: `src/client/components/projects/ProjectReport.tsx`
- Create: `src/client/components/projects/ProjectDetail.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Create: `scripts/project-report.test.tsx`

**Interfaces:**
- Consumes Project read APIs.
- Produces list/detail, search, status filter, pagination, selected-row state, active Issue rows, and historical Issue rows.

- [ ] **Step 1: Write failing React tests**

Render loading, empty, populated, filtered, cancelled, and API-error states. Assert Issue rows navigate to Issue detail and cancelled history is labeled but remains inspectable.

- [ ] **Step 2: Run RED**

Run the Project Report test and confirm missing components.

- [ ] **Step 3: Implement report/detail components**

Reuse shared visual tokens, SummaryStrip, selected-row indicator, and divider-based linked Issue rows. Preserve responsive behavior and avoid page-level horizontal overflow.

- [ ] **Step 4: Run GREEN**

Run targeted and full tests.

---

### Task 9: Shared Create/Change editor and Issue picker

**Files:**
- Create: `src/client/components/projects/ProjectEditor.tsx`
- Create: `src/client/components/projects/ProjectIssuePicker.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Create: `scripts/project-editor.test.tsx`
- Create: `scripts/project-issue-picker.test.tsx`

**Interfaces:**
- Consumes Project save and Issue option APIs.
- Produces Create/Change form, debounced search, add/remove selection, ownership conflict display, dirty-state navigation guard, and save validation.

- [ ] **Step 1: Write failing editor and picker tests**

Assert owner selection, initial `planned` status, add/remove behavior, duplicate prevention, disabled Issue owned by another Project, editing with the current Project exclusion, dirty navigation prompt, cancelled read-only state, and server-conflict display.

- [ ] **Step 2: Run RED**

Run both targeted tests and confirm missing components.

- [ ] **Step 3: Implement minimal editor and picker**

Keep unsaved Issue selections in editor state. Send the complete unique `issueIds` array only on Save. Requery Project detail after successful save.

- [ ] **Step 4: Run GREEN**

Run targeted and full tests.

---

### Task 10: Cancel and delete user experience

**Files:**
- Create: `src/client/components/projects/ProjectActions.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Create: `scripts/project-actions.test.tsx`

**Interfaces:**
- Consumes the current auth user and lifecycle APIs.
- Produces cancel reason modal, exact-key delete confirmation, admin-only Delete action, and cancelled read-only UI.

- [ ] **Step 1: Write failing action tests**

Assert cancel for USER/ADMIN, reason requirement, Delete hidden for USER, Delete shown for ADMIN, exact Project key confirmation, state refresh after mutation, and no Generate action.

- [ ] **Step 2: Run RED**

Run the action test and confirm missing component behavior.

- [ ] **Step 3: Implement action component**

Match Issue action-dialog patterns while using Project-specific copy. Treat backend `403` as the final authorization result.

- [ ] **Step 4: Run GREEN**

Run targeted and full tests.

---

### Task 11: Migration rehearsal and regression verification

**Files:**
- Create: `scripts/project-migration-audit.mjs`
- Modify: `docs/superpowers/plans/2026-07-31-project-go-live.md` only to mark executed checkpoints.

**Interfaces:**
- Produces a read-only audit report for Project tables, constraints, indexes, row counts, orphan links, and duplicate active Issue assignments.

- [ ] **Step 1: Run backup and staging migration**

Capture a verified database backup, apply `npm run db:schema` against staging, and record schema audit output.

- [ ] **Step 2: Run complete automated verification**

```powershell
cmd.exe /c npm test
cmd.exe /c npm run build
```

Expected: zero failed tests and successful TypeScript/Vite build.

- [ ] **Step 3: Run browser UAT**

Verify Report/Create/Change, add/remove, conflict handling, cancel/reuse, USER permissions, ADMIN delete, responsive widths, direct Issue navigation, and zero console errors.

- [ ] **Step 4: Production rollout checkpoint**

Deploy API/schema with Project navigation disabled, run smoke checks, enable Project navigation, and monitor error logs. Roll back application code if smoke checks fail; additive tables remain harmless and are not dropped during emergency rollback.

---

## Deferred Phase: Project CR Transport Document

This phase starts only after the user supplies the `.docx` template.

Its separate spec will define placeholder/repeating-section contracts, a local fixture-based Template Sandbox, document validation, a Project document service, and the Generate action. None of those items are prerequisites for this plan.
