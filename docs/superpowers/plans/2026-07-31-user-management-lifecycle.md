# User Management Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure ADMIN-only account lifecycle workspace with rename, role/status maintenance, password reset, force logout, archive, restore, and audit history.

**Architecture:** Add archive metadata and a permanent username registry, move management operations into a transactional service, expose explicit ADMIN-only endpoints, and replace the inline create/reset UI with an API-backed list/detail workspace. Security-sensitive mutations revoke target sessions and enforce self/last-admin protections in the backend.

**Tech Stack:** PostgreSQL, Node.js, Express, TypeScript, React 19, CSS, Node test runner, Vite.

## Global Constraints

- Every User Management route and UI entry is ADMIN-only.
- Delete is soft delete; no application hard delete exists.
- Previous usernames remain reserved forever.
- Restore reuses the original user ID and requires a new password, role, and status.
- Passwords and password hashes never appear in audit metadata or responses.
- Protected self/last-admin operations are rejected server-side.
- Project implementation remains a separate plan.

---

### Task 1: User-management domain rules

**Files:**
- Create: `src/server/users/userManagementDomain.ts`
- Create: `src/shared/userManagementTypes.ts`
- Create: `scripts/user-management-domain.test.ts`

**Interfaces:**
- Produces normalized filter/payload types and:

```ts
normalizeManagedUsername(value: string): string
assertUsernameChangeAllowed(target, actor, nextUsername): void
assertRoleChangeAllowed(target, actor, activeAdminCount, nextRole): void
assertStatusChangeAllowed(target, actor, activeAdminCount, isActive): void
assertArchiveAllowed(target, actor, activeAdminCount): void
```

- [ ] Write failing tests for uppercase normalization, invalid username/password, self-demotion/deactivate/archive, last-admin protection, and allowed self-rename.
- [ ] Run `cmd.exe /c npx tsx --test scripts\user-management-domain.test.ts` and confirm RED.
- [ ] Implement minimal types/rules without database access.
- [ ] Run the targeted test and confirm GREEN.

### Task 2: Archive and username-registry schema

**Files:**
- Create: `database/migrations/20260731_user_management_lifecycle.sql`
- Create: `scripts/user-management-schema-contract.test.mjs`

**Interfaces:**
- Produces archive columns on `app_users`, `app_user_usernames`, backfill SQL, and required indexes/FKs.

- [ ] Write a failing schema contract for archive columns, normalized username primary key, one-current-name partial unique index, actor FKs, and idempotent backfill.
- [ ] Run the contract and confirm RED.
- [ ] Implement additive idempotent migration SQL.
- [ ] Apply it twice to a disposable PostgreSQL schema and verify constraints/backfill.
- [ ] Run the contract and confirm GREEN.

### Task 3: Transactional service read/create

**Files:**
- Create: `src/server/users/userManagementService.ts`
- Create: `scripts/user-management-service-read.test.ts`

**Interfaces:**
- Produces:

```ts
listManagedUsers(filters, actor): Promise<ManagedUserListResult>
getManagedUserAudit(userId, actor): Promise<UserAuditEntry[]>
createManagedUser(payload, actor): Promise<ManagedUser>
```

- [ ] Write failing integration tests for current/archived scopes, active/inactive filters, pagination, audit reads, current/archived/retired username conflicts, and create audit.
- [ ] Run the targeted test and confirm RED.
- [ ] Implement parameterized queries and transaction-safe username reservation.
- [ ] Run the targeted test and confirm GREEN.

### Task 4: Rename, role, and status mutations

**Files:**
- Modify: `src/server/users/userManagementService.ts`
- Create: `scripts/user-management-profile-status.test.ts`

**Interfaces:**
- Produces:

```ts
updateManagedUserProfile(userId, payload, actor): Promise<ManagedUser>
setManagedUserStatus(userId, isActive, actor): Promise<ManagedUser>
```

- [ ] Write failing tests for stable user ID rename, retired-name reservation, rename/role audit metadata, session revocation, self-demotion/deactivate rejection, and concurrent last-admin protection.
- [ ] Run RED.
- [ ] Implement advisory-locked mutations and session revocation.
- [ ] Run GREEN.

### Task 5: Password reset and force logout

**Files:**
- Modify: `src/server/users/userManagementService.ts`
- Create: `scripts/user-management-security-actions.test.ts`

**Interfaces:**
- Produces:

```ts
resetManagedUserPassword(userId, password, actor): Promise<void>
revokeManagedUserSessions(userId, actor): Promise<void>
```

- [ ] Write failing tests for minimum password length, self-reset rejection, `must_change_password`, cleared password date, revoked sessions, and audit actions without password data.
- [ ] Run RED.
- [ ] Implement password hashing, transactional update, revocation, and safe audit metadata.
- [ ] Run GREEN.

### Task 6: Archive and restore

**Files:**
- Modify: `src/server/users/userManagementService.ts`
- Create: `scripts/user-management-archive-restore.test.ts`

**Interfaces:**
- Produces:

```ts
archiveManagedUser(userId, reason, actor): Promise<void>
restoreManagedUser(userId, payload, actor): Promise<ManagedUser>
```

- [ ] Write failing tests for required archive reason, self/last-admin protection, hidden normal-list behavior, login denial, session revocation, create-to-restore conflict, stable user ID restore, new password/role/status, and audit.
- [ ] Run RED.
- [ ] Implement archive and restore transactions.
- [ ] Run GREEN.

### Task 7: ADMIN-only API routes

**Files:**
- Modify: `src/server/routes/userRoutes.ts`
- Create: `scripts/user-management-routes.test.ts`

**Interfaces:**
- Replaces direct route SQL with service calls and exposes list/audit/create/profile/status/password/revoke/archive/restore.

- [ ] Write failing tests for non-admin `403`, validation status codes, reserved username `409`, protected actions `403`, archived `404` in current scope, and safe response bodies.
- [ ] Run RED.
- [ ] Implement thin route handlers behind existing `requireAdmin`.
- [ ] Run GREEN.

### Task 8: Client API

**Files:**
- Create: `src/client/api/userManagementApi.ts`
- Create: `scripts/user-management-client-api.test.ts`

**Interfaces:**
- Produces typed fetch/create/update/status/reset/revoke/archive/restore/audit functions.

- [ ] Write failing request-contract tests for every method, URL, and body.
- [ ] Run RED.
- [ ] Implement functions using the existing JSON error convention.
- [ ] Run GREEN.

### Task 9: User Management workspace

**Files:**
- Create: `src/client/components/users/UserManagementWorkspace.tsx`
- Create: `src/client/components/users/UserDetailPanel.tsx`
- Create: `src/client/components/users/UserEditorDialog.tsx`
- Create: `src/client/components/users/UserActionDialogs.tsx`
- Create: `src/client/styles/user-management.css`
- Create: `scripts/user-management-workspace.test.tsx`

**Interfaces:**
- Produces Users/Archived Users tabs, active/inactive filters, list/detail selection, create/edit, role/status, reset, revoke, archive, restore, and audit view.

- [ ] Write failing React tests for loading/empty/error, filters, selected state, current/archived visibility, protected disabled actions, conflict-to-restore, and audit display.
- [ ] Run RED.
- [ ] Implement components using shared visual tokens and accessible dialogs.
- [ ] Run GREEN.

### Task 10: Application integration and self-rename logout

**Files:**
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/main.tsx`
- Modify: `src/server/index.ts`
- Modify: `database/schema.sql`
- Modify: `package.json`
- Create: `scripts/user-management-integration.test.ts`

**Interfaces:**
- Replaces the inline `UserManagement` implementation, imports its stylesheet, applies canonical schema additions, and adds all tests to `npm test`.

- [ ] Write failing integration contracts for ADMIN-only navigation, absence of inline legacy management, style import, canonical schema, and self-rename return-to-login.
- [ ] Run RED.
- [ ] Integrate the new workspace/service while preserving current authentication and Change Password behavior.
- [ ] Run GREEN and full `npm test`.

### Task 11: Migration, security, and browser UAT

**Files:**
- Create: `scripts/user-management-migration-audit.mjs`

**Interfaces:**
- Produces a read-only audit of archive columns, registry coverage, duplicate current usernames, active-admin count, and orphan sessions.

- [ ] Back up production and rehearse migration on staging.
- [ ] Run the migration audit and resolve any failed invariant before deployment.
- [ ] Run `cmd.exe /c npm test` and `cmd.exe /c npm run build`.
- [ ] Browser-test ADMIN and USER sessions, rename/relogin, role/status, reset, force logout, archive, create conflict, restore, last-admin protection, responsive layout, and console errors.
