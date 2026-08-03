# Project and User Management Parallel Execution Plan

## Decision

Parallel development is feasible after creating a clean, user-approved Git checkpoint of the current dirty workspace. Development uses separate worktrees and strict file ownership; integration remains sequential.

## Prerequisite

Before execution:

1. Review the current dirty diff.
2. Obtain explicit user approval to create a checkpoint commit containing the accepted existing enhancements and planning documents.
3. Create two branches/worktrees from that exact checkpoint:
   - `codex/project-go-live`
   - `codex/user-management-lifecycle`

Without the checkpoint, worktrees would start from old `HEAD` and omit accepted uncommitted frontend changes.

## Lane A: Project

Owns only:

- `src/shared/projectTypes.ts`
- `src/server/projects/**`
- `src/server/db/projectRepository.ts`
- `src/server/routes/projectRoutes.ts`
- `src/client/api/projectApi.ts`
- `src/client/components/projects/**`
- `src/client/styles/project.css`
- `database/migrations/20260731_project_go_live.sql`
- `scripts/project-*.test.*`

It must not modify shared integration files.

## Lane B: User Management

Owns only:

- `src/shared/userManagementTypes.ts`
- `src/server/users/**`
- `src/server/routes/userRoutes.ts`
- `src/client/api/userManagementApi.ts`
- `src/client/components/users/**`
- `src/client/styles/user-management.css`
- `database/migrations/20260731_user_management_lifecycle.sql`
- `scripts/user-management-*.test.*`

It must not modify shared integration files.

## Coordinator-Only Files

Only the integration lane modifies:

- `src/client/pages/App.tsx`
- `src/client/main.tsx`
- `src/client/api.ts`
- `src/client/styles.css`
- `src/server/index.ts`
- `database/schema.sql`
- `package.json`

If a development lane needs one of these files changed, it records the exact requested integration change in its handoff rather than editing the file.

## Execution Sequence

### Phase 0: Isolation

- Create the approved checkpoint.
- Create both worktrees.
- Confirm each worktree passes the current full test suite before new work.

### Phase 1: Parallel domain development

- Lane A executes Project Tasks 1-9 excluding shared-file integration.
- Lane B executes User Management Tasks 1-9 excluding shared-file integration.
- Each lane follows test-first development and runs targeted tests.
- Each lane commits only its owned files.

### Phase 2: Independent review

- Review Lane A against the Project spec.
- Review Lane B against the User Management spec.
- Run each lane's targeted tests and build/type checks.
- Reject any shared-file edits before integration.

### Phase 3: Sequential integration

The coordinator merges both branches into an integration branch and then:

1. Applies User Management migration followed by Project migration in a disposable schema.
2. Merges both additive migrations into canonical `database/schema.sql`.
3. Mounts routes in `src/server/index.ts`.
4. Imports domain API modules/components/styles.
5. Replaces inline Project/User Management prototypes in `App.tsx`.
6. Adds both test groups to `package.json`.
7. Resolves cross-domain behavior: Project audit actors use `app_users`; archived users remain valid historical actor references.

### Phase 4: Integrated verification

- Run all schema contracts.
- Apply canonical schema twice to prove idempotency.
- Run complete `npm test`.
- Run `npm run build`.
- Run browser UAT for both features.
- Specifically test deactivating/archiving an app user referenced by Project audit snapshots.

### Phase 5: Deployment

- Back up production.
- Apply User Management schema first.
- Apply Project schema second.
- Deploy application with both navigation entries feature-flagged off.
- Smoke-test ADMIN auth and schema.
- Enable User Management, validate account recovery.
- Enable Project, validate Issue assignment.
- Monitor conflicts, authentication failures, and server errors.

## Why Integration Is Sequential

The features are independent at the domain level but share application composition and canonical schema files. Parallelizing those final edits would trade a small amount of time for merge risk. Keeping integration sequential preserves speed in the large independent portions while protecting authentication, schema, and navigation behavior.
