# Delete Latest Cancelled Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow ADMIN to delete only the highest-numbered cancelled Project so its number is reused by the next Project.

**Architecture:** The repository derives a `canDelete` capability for every Project row and enforces the same rule transactionally during deletion under the existing Project-number advisory lock. The UI consumes the capability to show the destructive action only when it is valid; route-level ADMIN authorization remains unchanged.

**Tech Stack:** TypeScript, Express, PostgreSQL, React, Node test runner.

## Global Constraints

- Only an ADMIN can call the Project delete endpoint.
- Only a `cancelled` Project with the current highest `project_no` is deletable.
- Existing Project numbers are never renumbered.
- Deletion must not delete Issue or SAP CR data.
- Historical Project relationship snapshots remain available.

---

### Task 1: Repository deletion capability and enforcement

**Files:**
- Modify: `src/shared/projectTypes.ts`
- Modify: `src/server/db/projectRepository.ts`
- Test: `scripts/project-repository-read.test.ts`
- Test: `scripts/project-lifecycle.test.ts`
- Test: `scripts/project-repository-write.test.ts`

**Interfaces:**
- Produces: `ProjectRow.canDelete: boolean`
- Produces: `deleteProject(id: number, actor: AuthUser): Promise<{ ok: true; id: number }>` with typed `409` rejections for invalid lifecycle/counter state.

- [x] **Step 1: Write failing read and lifecycle tests**

Add literal fixtures proving only the highest cancelled row maps to `canDelete: true`, and update the delete fixture to include `project_status` and `project_no`. Add rejection cases for active Projects and older cancelled Projects.

```ts
assert.equal(result.rows[0].canDelete, true);
await assert.rejects(
  deleteProject(2, admin),
  (error) => error instanceof ProjectRepositoryError && error.code === "PROJECT_DELETE_NOT_ALLOWED"
);
```

- [x] **Step 2: Run tests and verify RED**

Run:

```powershell
cmd.exe /c npm.cmd exec -- tsx --test scripts/project-repository-read.test.ts scripts/project-lifecycle.test.ts scripts/project-repository-write.test.ts
```

Expected: failures because `canDelete` is absent and `deleteProject` accepts invalid rows.

- [x] **Step 3: Implement capability and transactional validation**

Add `canDelete` to `ProjectRow`. Include this derived expression in list/detail queries:

```sql
h.project_status = 'cancelled'
AND h.project_no = (SELECT MAX(candidate.project_no) FROM project_headers candidate)
AS can_delete
```

Map it with `canDelete: row.can_delete === true`. In `deleteProject`, acquire `pg_advisory_xact_lock(hashtext('project_number'))`, select `project_status` and `project_no`, and reject unless both conditions hold:

```ts
if (current.project_status !== "cancelled" || Number(current.project_no) !== Number(highest.rows[0].max_project_no)) {
  throw new ProjectRepositoryError(
    "Only the latest cancelled Project can be deleted",
    409,
    "PROJECT_DELETE_NOT_ALLOWED"
  );
}
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused repository/lifecycle tests pass.

### Task 2: ADMIN action for the latest cancelled Project

**Files:**
- Modify: `src/client/components/projects/ProjectActions.tsx`
- Test: `scripts/project-actions.test.tsx`

**Interfaces:**
- Consumes: `ProjectRow.canDelete`
- Preserves: exact Project-key confirmation before deletion.

- [x] **Step 1: Write the failing component test**

Render cancelled fixtures for ADMIN and USER. Assert that ADMIN sees Delete only with `canDelete: true`, while USER and older cancelled Projects see no Delete action.

```tsx
const latestCancelled = { ...project, projectStatus: "cancelled", canDelete: true } as const;
assert.match(renderToStaticMarkup(<ProjectActions project={latestCancelled} userRole="ADMIN" onChanged={() => undefined} />), /Delete Project/);
```

- [x] **Step 2: Run the test and verify RED**

Run:

```powershell
cmd.exe /c npm.cmd exec -- tsx --test scripts/project-actions.test.tsx
```

Expected: ADMIN receives only the cancelled read-only message.

- [x] **Step 3: Implement the conditional cancelled action**

Keep the cancelled read-only state unless the actor is ADMIN and `project.canDelete` is true. In that case render the existing Delete dialog/action without rendering Cancel.

```tsx
const canDelete = userRole === "ADMIN" && project.canDelete;
if (project.projectStatus === "cancelled" && !canDelete) {
  return <p className="project-read-only">Cancelled Project · read-only</p>;
}
```

- [x] **Step 4: Run focused and full verification**

Run:

```powershell
cmd.exe /c npm.cmd test
cmd.exe /c npm.cmd run build
git diff --check
```

Expected: all tests and build pass; no whitespace errors.
