# User Management Lifecycle Design

## Objective

Upgrade the ADMIN-only User Management feature from create/reset-only into a secure account lifecycle workspace supporting search, profile maintenance, role/status changes, password reset, session revocation, soft delete, archived-user restore, and immutable audit history.

## Confirmed Rules

- Every User Management page and endpoint is ADMIN-only.
- Username can be renamed while preserving the same `user_id` and business history.
- Every previous username remains permanently reserved and cannot be assigned to another user.
- Delete means soft delete/archive. The row remains in the database but disappears from the normal application list and cannot log in.
- Archived users are accessible through an ADMIN-only `Archived Users` view and can be restored.
- Creating a username owned by an archived user returns a conflict and offers Restore instead of creating a second identity.
- Restore reuses the old `user_id` and requires a new initial password, role, and active/inactive status.
- Account-changing security actions revoke all sessions of the target user.

## Recommended UI

User Management uses the same list/detail visual language as the application reports:

- Toolbar with search, role filter, status filter, and `Create User`.
- Tabs for `Users` and `Archived Users`. The normal `Users` tab includes both active and inactive non-archived accounts.
- User table/list on the left.
- Detail and actions panel on the right.
- Selected-row state, divider hierarchy, status badges, modal confirmations, and responsive stacking use existing visual tokens.

The normal workspace supports rename, role change, activate/deactivate, reset password, force logout, and archive. The archived workspace supports read-only audit context and Restore.

## Database Design

### Changes to `app_users`

Add:

- `deleted_at TIMESTAMPTZ`
- `deleted_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL`
- `deleted_by_snapshot TEXT`
- `delete_reason TEXT`

Active application queries require `deleted_at IS NULL`. Authentication also requires `deleted_at IS NULL`.

### `app_user_usernames`

This registry makes username reservation concurrency-safe:

| Column | Rule |
|---|---|
| `normalized_username TEXT PRIMARY KEY` | Uppercase trimmed username, reserved forever |
| `display_username TEXT NOT NULL` | Current spelling shown in audit |
| `user_id BIGINT NOT NULL REFERENCES app_users(id)` | Stable account identity |
| `is_current BOOLEAN NOT NULL` | Exactly one current username per user |
| `reserved_at TIMESTAMPTZ NOT NULL` | Reservation time |
| `retired_at TIMESTAMPTZ` | Set when renamed |
| `changed_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL` | ADMIN actor |
| `changed_by_snapshot TEXT` | Actor snapshot |

A partial unique index on `user_id WHERE is_current` enforces one current username. Existing users are backfilled into this registry idempotently.

### Existing audit table

`app_user_audit_logs` remains the immutable action log. Metadata stores safe before/after values and target username snapshots, never passwords or hashes.

Actions:

- `USER_CREATED`
- `USERNAME_CHANGED`
- `ROLE_CHANGED`
- `USER_ACTIVATED`
- `USER_DEACTIVATED`
- `PASSWORD_RESET`
- `SESSIONS_REVOKED`
- `USER_ARCHIVED`
- `USER_RESTORED`

## Service Layer

Move management SQL out of `userRoutes.ts` into `userManagementService.ts`:

```ts
listManagedUsers(filters, actor): Promise<ManagedUserListResult>
getManagedUserAudit(userId, actor): Promise<UserAuditEntry[]>
createManagedUser(payload, actor): Promise<ManagedUser>
updateManagedUserProfile(userId, payload, actor): Promise<ManagedUser>
setManagedUserStatus(userId, isActive, actor): Promise<ManagedUser>
resetManagedUserPassword(userId, password, actor): Promise<void>
revokeManagedUserSessions(userId, actor): Promise<void>
archiveManagedUser(userId, reason, actor): Promise<void>
restoreManagedUser(userId, payload, actor): Promise<ManagedUser>
```

Mutations run in transactions. Username reservation and last-active-admin checks use transaction advisory locks so concurrent requests cannot bypass them.

## Identity and Session Behavior

### Rename

- Validate the new normalized username against `app_user_usernames`.
- Retire the old current registry row.
- Insert the new current registry row.
- Update `app_users.username`.
- Audit old and new usernames.
- Revoke every target session.
- If an ADMIN renames their own account, the response succeeds and the client returns to login.

### Role and status

- Role changes and deactivate/activate actions are audited.
- Role change and deactivate revoke all target sessions.
- Activate does not restore an archived account.
- Archived accounts can only be returned through Restore.

### Password reset

- Requires a minimum-eight-character initial password.
- Sets `must_change_password = true`.
- Clears `password_changed_at`.
- Revokes all target sessions.
- ADMIN cannot use the management Reset action on their own account; they use Change Password.

### Force logout

- Revokes every active target session and writes `SESSIONS_REVOKED`.

### Archive

- Requires a reason.
- Sets `deleted_at`, delete actor fields, `is_active = false`, and `updated_at`.
- Revokes all sessions.
- Leaves username reservations and audit history intact.

### Restore

- Requires a new initial password, role, and active/inactive choice.
- Clears archive columns.
- Sets the selected role/status.
- Sets `must_change_password = true`.
- Keeps the current reserved username and original `user_id`.
- Revokes any sessions defensively and writes `USER_RESTORED`.

## Safety Rules

- An ADMIN cannot deactivate or archive their own account.
- An ADMIN cannot demote their own role.
- The management Reset Password action cannot target the current account.
- The final active, non-archived ADMIN cannot be demoted, deactivated, or archived.
- The backend applies every safety rule; disabled UI actions only explain why.
- All user-management routes continue to use `requireAdmin`.
- Username comparisons are normalized and case-insensitive.
- Create checks current, archived, and retired usernames.
- An archived username conflict returns `409` with a safe `archivedUserId` and `canRestore: true`.
- Passwords and password hashes are excluded from logs and responses.

## API

```text
GET    /api/users
GET    /api/users/:id/audit
POST   /api/users
PATCH  /api/users/:id/profile
PATCH  /api/users/:id/status
PATCH  /api/users/:id/password
POST   /api/users/:id/revoke-sessions
DELETE /api/users/:id
POST   /api/users/:id/restore
```

List filters:

```text
q
role=ADMIN|USER
status=active|inactive
scope=current|archived
page
pageSize
```

Expected responses include `400` validation, `401` authentication, `403` non-admin or protected self/last-admin action, `404` missing account, and `409` reserved/archived username conflict.

## Scope Exclusions

- No hard delete through the application.
- No granular permissions beyond ADMIN/USER.
- No email, display name, department, profile picture, or bulk actions.
- No password delivery by email.
- No viewing raw session tokens, password hashes, or sensitive authentication metadata.

## Verification

- Pure tests for username normalization, rename reservation, self-protection, and last-admin rules.
- Schema tests for archive fields and username registry constraints/backfill.
- Service integration tests for every mutation, audit row, rollback, and concurrent guard.
- Route tests for ADMIN-only enforcement and status codes.
- React tests for active/archived tabs, edit actions, disabled protected actions, conflict-to-restore flow, and self-rename logout.
- Full `npm test`, `npm run build`, database migration rehearsal, and browser UAT.
