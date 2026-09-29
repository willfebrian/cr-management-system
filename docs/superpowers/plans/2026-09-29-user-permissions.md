# User Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every account checkbox-managed feature permissions, with administrator-only maintenance and explicit per-account SAP transport Create and Release grants.

**Architecture:** A shared permission catalog defines keys and dependencies. PostgreSQL stores grants per account; Express middleware enforces them on every feature route; authentication returns effective grants to React for navigation and controls. The existing User Management workspace owns permission maintenance.

**Tech Stack:** TypeScript, React 19, Express 4, PostgreSQL, Node test runner and `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-29-user-permissions-design.md`

## Global Constraints

- Keep `ADMIN` and `USER` roles; role alone grants no application feature.
- Only an active `ADMIN` with `users.manage` can change accounts or permissions; at least one such administrator must remain.
- `transport.create` and `transport.release` are separate grants, absent by default for every account and migrated account.
- CR SAP and GLPI Issue reference editing requires role `ADMIN` and its respective grant; CR Helpdesk editing is granted by default to both roles and remains revocable.
- Confirmation email, GLPI ticket template, GLPI prefill opening, CR Transport form, CR User form, and reminder sending are distinct Issue actions.
- Preserve existing accounts' intended UI-available non-transport access; do not preserve accidentally exposed sensitive API access.
- English for new UI text, documentation, and code comments; conversational responses may be in Bahasa Indonesia.
- Every protected server route must reject unauthorized direct requests, independent of client UI state.

## Review Focus

- A grant revoked while a session is open must fail on the next API request; Task 3 tests this.
- A role demotion, archival, or grant edit must never remove the last active permission manager; Task 4 tests all three paths.
- An appearance-only user must not receive administrative settings or connection credentials; Task 7 tests settings responses.
- An unauthorized Issue reference change, including a missing reference field, must not clear stored values or partially save the Issue; Task 6 tests this.
- A user with no page-view grants must still be able to change password and log out; Task 8 tests the landing state and basic auth paths.

---

## File and interface map

- `src/shared/permissions.ts`: catalog, keys, group metadata, dependencies, starter presets, and pure validation helpers.
- `database/migrations/20260929_user_permissions.sql` and `database/schema.sql`: grant storage and idempotent backfill.
- `src/server/auth/permissionRepository.ts`: grant reads and atomic replacement; no route logic.
- `src/server/auth/authService.ts`, `src/server/auth/middleware.ts`, `src/server/routes/authRoutes.ts`: effective grants on auth user and `requirePermission` middleware.
- `src/server/users/userManagementService.ts`, `src/server/routes/userRoutes.ts`, `src/shared/userManagementTypes.ts`: administrator-only permission editing and audit.
- `src/server/routes/{crRoutes,projectRoutes,transportRequestRoutes,transportReleaseRoutes,adminRoutes,auditRoutes,aiRoutes,outlookRoutes}.ts`: endpoint guards.
- `src/server/db/issueRepository.ts` and an Issue-save authorization module: transactional comparison of protected reference sets.
- `src/client/permissions.ts`, `src/client/pages/App.tsx`, `src/client/pages/MasterDataWorkspace.tsx`, `src/client/components/users/*`: permission-driven UI and editing.
- `scripts/*permissions*.test.*`: focused catalog, migration, route, service, and UI tests. Existing test commands remain available.

### Task 1: Permission catalog and validation

**Files:** Create `src/shared/permissions.ts`; create `scripts/permissions-catalog.test.ts`.

**Interfaces:** Produce `PermissionKey`, `PERMISSION_CATALOG`, `REGULAR_USER_PRESET`, `ADMIN_PRESET`, `normalizePermissions(keys: readonly string[], role: UserRole): PermissionKey[]`, and `hasPermission(keys: readonly PermissionKey[], key: PermissionKey): boolean`. `normalizePermissions` rejects unknown keys and admin-only grants for `USER`, adds required view parents for selected actions, and returns unique catalog-order keys. `issue.create_glpi_ticket` requires `issue.generate_glpi_template`. Both presets omit transport Create and Release. Both presets include `issue.helpdesk_references`; only the Admin preset includes `issue.cr_references` and `issue.glpi_references`. The Issue output actions and `issue.reminder` have independent keys.

- [ ] Write `scripts/permissions-catalog.test.ts` with tests named `presetsOmitTransportMutations`, `referencePresetsMatchRole`, `issueOutputGrantsAreIndependent`, `dependentIssueActionAddsView`, `transportActionsAreIndependent`, `userCannotHoldManagementGrant`, and `unknownPermissionIsRejected`; assert the exact spec keys.
- [ ] Run `npx tsx --test scripts/permissions-catalog.test.ts`; expect failures because the catalog does not exist.
- [ ] Implement the interfaces in `src/shared/permissions.ts`, with the full catalog and dependency rules from the spec.
- [ ] Run `npx tsx --test scripts/permissions-catalog.test.ts`; expect all tests to pass.
- [ ] Commit the catalog and test with `git commit -m "feat: define feature permission catalog"`.

### Task 2: Durable grants and safe migration

**Files:** Create `database/migrations/20260929_user_permissions.sql`; modify `database/schema.sql`; create `src/server/auth/permissionRepository.ts`; create `scripts/permissions-migration-contract.test.mjs`; create `scripts/permission-repository.test.ts`.

**Interfaces:** Produce `listUserPermissions(userId: number): Promise<PermissionKey[]>` and `replaceUserPermissions(client: PoolClient, userId: number, keys: readonly PermissionKey[]): Promise<void>`. Table `app_user_permissions(user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE, permission_key TEXT, granted_at TIMESTAMPTZ, granted_by_user_id BIGINT NULL REFERENCES app_users(id), PRIMARY KEY(user_id, permission_key))`. The backfill uses separate role-specific non-transport key sets, only for non-archived accounts, and `ON CONFLICT DO NOTHING`; any existing administrator receives `users.manage`, `issue.cr_references`, and `issue.glpi_references`, while both roles receive `issue.helpdesk_references` and their current Issue output actions. The schema and migration must yield the same table definition and backfill behavior.

- [ ] Write migration contract assertions for table shape, idempotent backfill, role-specific reference grants, independent Issue output grants, no transport Create/Release backfill, and no archived-account backfill; write repository tests for empty grants, ordered reads, and atomic replacement.
- [ ] Run `node scripts/permissions-migration-contract.test.mjs` and `npx tsx --test scripts/permission-repository.test.ts`; expect failures.
- [ ] Add the schema/migration SQL and repository functions; keep SQL parameterized and use the caller's transaction for replacement.
- [ ] Run both focused commands; expect passes.
- [ ] Commit with `git commit -m "feat: persist and backfill user permissions"`.

### Task 3: Effective session grants and server guard

**Files:** Modify `src/server/auth/authService.ts`, `src/server/auth/middleware.ts`, `src/server/routes/authRoutes.ts`, `src/client/api.ts`; create `scripts/permission-auth.test.ts`.

**Interfaces:** Extend both server and client `AuthUser` with `permissions: PermissionKey[]`. Produce `requirePermission(key: PermissionKey): RequestHandler`; it returns 403 `{ code: "PERMISSION_DENIED", message: "You do not have permission to perform this action." }`. `userFromToken` loads current grants per request; login and `/api/auth/me` return them. Preserve password-change and logout authentication without feature grants.

- [ ] Write tests for login and `/me` permission payloads, unauthenticated 401, missing-grant 403, allowed-grant success, and a revoked grant failing on the next request of the same active session.
- [ ] Run `npx tsx --test scripts/permission-auth.test.ts`; expect failures.
- [ ] Implement the auth shape and middleware; avoid retaining a permission snapshot in the session row or long-lived server cache.
- [ ] Run the focused test and existing `npx tsx --test scripts/auth-persistent-session.test.ts scripts/auth-user-id-normalization.test.ts`; expect passes.
- [ ] Commit with `git commit -m "feat: enforce current account permissions in auth"`.

### Task 4: Permission maintenance and last-manager protection

**Files:** Modify `src/shared/userManagementTypes.ts`, `src/server/users/userManagementService.ts`, `src/server/users/userManagementDomain.ts`, `src/server/routes/userRoutes.ts`; create `scripts/user-permissions-service.test.ts` and `scripts/user-permissions-routes.test.ts`.

**Interfaces:** Extend `ManagedUser` with `permissions: PermissionKey[]`; creation and restoration payloads carry explicit `permissions`; profile update may carry `permissions`. Add `updateManagedUserPermissions(targetUserId: number, keys: readonly string[], actor: ManagementActor): Promise<ManagedUser>`. The service validates through `normalizePermissions`, updates in one transaction, writes before/after audit, and checks the last-manager invariant under row locks. Existing create, demote, deactivate, archive, and restore flows must use the same invariant and grant transaction. Protect user routes with role `ADMIN` plus `users.view` or `users.manage` as appropriate. Add permission filter support to the list route.

- [ ] Write service and route tests for allowed save, non-admin 403, admin lacking `users.manage` 403, unknown key 400, `USER` rejection for CR SAP and GLPI reference grants, role demotion clearing admin-only grants, and last-manager protection on permission removal, demotion, deactivation, and archive.
- [ ] Run `npx tsx --test scripts/user-permissions-service.test.ts scripts/user-permissions-routes.test.ts`; expect failures.
- [ ] Implement payloads, filtering, transaction and lock order, audit entry, route guards, and last-manager checks. Preserve existing account lifecycle rules.
- [ ] Run focused tests plus `npm run test:users`; expect passes.
- [ ] Commit with `git commit -m "feat: manage user grants with administrator safeguards"`.

### Task 5: SAP transport and application workflow guards

**Files:** Modify `src/server/routes/transportRequestRoutes.ts`, `src/server/routes/transportReleaseRoutes.ts`, `src/server/routes/crRoutes.ts`, `src/server/routes/projectRoutes.ts`, `src/server/routes/aiRoutes.ts`, `src/server/routes/outlookRoutes.ts`; create `scripts/permissions-workflow-routes.test.ts`.

**Interfaces:** Apply `requirePermission` to each endpoint before side effects. Create resolve/preflight/create use `transport.create`; Release candidates/test-run/operation polling/start/execute use `transport.release`; report/read/export/sync use their catalog keys. Issue and Project routes map to their distinct catalog actions. In `crRoutes.ts`, map template kind `email` to `issue.generate_email`, `ticket` to `issue.generate_glpi_template`, CR Transport form to `issue.generate_cr_transport_form`, CR User form to `issue.generate_cr_user_form`, and reminder preview/draft/send to `issue.reminder`; batch CR Transport form uses the same form grant. The GLPI prefill opening is client-side, so `issue.create_glpi_ticket` guards that button and requires `issue.generate_glpi_template`; it cannot authorize the final submission within GLPI. AI and Outlook operations inherit the Issue workflow that calls them; any shared route must validate its exact action server-side. Keep existing Project delete restrictions only where they are stricter than the catalog.

- [ ] Build a route inventory in the test file listing every endpoint in these route modules and its permission; test direct unauthorized Create, Release, sync, Issue mutation, Project mutation, export, and each Issue output action returning 403 before service calls, including an `ADMIN` lacking each transport grant.
- [ ] Run `npx tsx --test scripts/permissions-workflow-routes.test.ts`; expect failures.
- [ ] Add the guards and resolve shared auxiliary route ownership without weakening checks.
- [ ] Run the focused test plus `npm run test:baseline` and `npm run test:project`; expect passes.
- [ ] Commit with `git commit -m "feat: guard transport and workflow operations"`.

### Task 6: Transactional Issue reference authorization

**Files:** Create `src/server/issues/issueReferenceAuthorization.ts`; modify `src/server/db/issueRepository.ts`, `src/server/routes/crRoutes.ts`; create `scripts/issue-reference-permissions.test.ts`.

**Interfaces:** Produce `assertIssueReferenceChangesAllowed(payload: IssueSavePayload, stored: IssueReferenceSets, actor: AuthUser): void`, where `IssueReferenceSets` contains normalized `crLinks`, `glpiTickets`, and `crHelpdeskNumbers` arrays. An omitted payload property preserves the stored set; an explicitly empty property requests removal. For an edit, `saveIssue` locks the current Issue row and reads reference sets inside its existing transaction before any mutation, calls the assertion, and performs replacements only for provided categories. For create, the stored sets are empty. A difference without the respective grant throws a typed 403 `PERMISSION_DENIED`; CR SAP and GLPI additionally require `ADMIN`. The `POST /issues` and `PUT /issues/:id` routes pass the authenticated actor into save. The Issue Create-and-link button checks both grants before opening the SAP flow; the SAP Create endpoint enforces `transport.create`, and the later Issue save enforces `issue.cr_references` when the CR number is linked. This reflects the existing two-step SAP/create-and-save flow; an intervening revocation can leave a created SAP request unlinked but cannot create an unauthorized Issue link.

- [ ] Write tests for create and edit first entry, replacement, removal, unchanged values, omitted fields, and independent grants for all three reference types; assert that a denied reference change leaves the Issue header and all links unchanged.
- [ ] Run `npx tsx --test scripts/issue-reference-permissions.test.ts`; expect failures.
- [ ] Add the pure comparison helper and integrate it with the locked Issue save transaction and route actor; keep existing Issue validation and project-link rules.
- [ ] Run the focused test plus `npx tsx --test scripts/issue-ai-form-policy.test.ts scripts/issue-cr-release-model.test.ts`; expect passes.
- [ ] Commit with `git commit -m "feat: enforce issue reference field permissions"`.

### Task 7: Master Data, Settings, and Audit guards

**Files:** Modify `src/server/routes/adminRoutes.ts`, `src/server/routes/auditRoutes.ts`, `src/client/pages/MasterDataWorkspace.tsx`; create `scripts/permissions-admin-routes.test.ts`.

**Interfaces:** Split reads and writes by catalog keys. `master_data.view` permits the Master Data landing; People writes require `master_data.people`, Group Email writes require `master_data.group_emails`. Target System operations and connection tests require `settings.target_systems`; General, AI, and Template operations require their respective keys; Audit reads require `audit.view`. Personal appearance must use local storage or a non-sensitive, explicitly scoped settings response; no administrative settings, RFC credentials, or integration secrets may be returned to an appearance-only account. Shared settings writes are restricted to allowlisted keys for the matching permission.

- [ ] Write tests for each settings section's allowed and denied read/write, appearance-only access without secret fields, direct People/Group Email mutation denial, target-system connection test denial, and audit 403.
- [ ] Run `npx tsx --test scripts/permissions-admin-routes.test.ts`; expect failures.
- [ ] Add route guards, split or scope settings payloads by permission, and update the settings client to request only authorized sections.
- [ ] Run the focused test plus `npx tsx --test scripts/mcp-email-admin-settings.test.ts scripts/mcp-email-settings-ui.test.tsx`; expect passes.
- [ ] Commit with `git commit -m "feat: guard administrative settings and audit data"`.

### Task 8: Permission-driven navigation and checkbox editor

**Files:** Create `src/client/permissions.ts` and `src/client/components/users/UserPermissionsPanel.tsx`; modify `src/client/pages/App.tsx`, `src/client/components/users/UserManagementWorkspace.tsx`, `src/client/components/users/UserDetailPanel.tsx`, `src/client/components/users/UserEditorDialog.tsx`, `src/client/api/userManagementApi.ts`, `src/client/styles/user-management.css`; create `scripts/permissions-ui.test.tsx`.

**Interfaces:** `can(user: AuthUser, key: PermissionKey): boolean` reads the auth grant list. User Management shows grouped checkboxes, presets on create/restore, transport, reference, and management-change confirmation, filtering by grants, Save/Cancel, and dependency explanations. Navigation and in-page actions use the same catalog. Issue CR SAP, GLPI, and CR Helpdesk inputs are independently read-only without their grants, including in Create mode. The Issue Generate menu shows each output action only with its grant; Create Ticket in GLPI additionally needs its own grant and the GLPI template grant. The Issue Create-and-link button needs `transport.create` plus `issue.cr_references`; standalone Create needs only `transport.create`. An account with no page-view grants sees an access-limited landing with password change and logout. Refresh effective grants after save or 403; redirect away from an unauthorized active view.

- [ ] Write UI tests for a regular user's menu, independent Issue output checkbox states, the Issue Create-and-link versus standalone button, reference inputs read-only per grant on Create and Change, dependency selection/clearing, Admin-only checkbox behavior, saving changes, 403 refresh, and the no-view landing with password change and logout.
- [ ] Run `npx tsx --test scripts/permissions-ui.test.tsx`; expect failures.
- [ ] Implement the shared client helper and focused component; replace existing role-only navigation checks and protect all direct `setView` paths.
- [ ] Run the focused test plus `npx tsx --test scripts/user-management-workspace.test.tsx scripts/navigation-visual-state.test.ts`; expect passes.
- [ ] Commit with `git commit -m "feat: expose per-user permissions in navigation and user management"`.

### Task 9: Integration and release verification

**Files:** Modify `scripts/project-user-management-integration.test.mjs`; modify `README.md` to document permission maintenance and the transport grant migration.

**Interfaces:** No new public interface. This task verifies complete route coverage and documents administrator operations.

- [ ] Add an integration assertion that every mounted feature API route has an auth plus permission decision, and document how administrators grant transport access after migration.
- [ ] Run `npm run test`, `npm run build`, and `git diff --check`; expect all to pass and no whitespace errors.
- [ ] Review the migration against a fresh database and an existing-account database, confirming at least one active manager and no transport mutation grants; record any environment-specific validation limit in the final report.
- [ ] Commit with `git commit -m "test: verify permission coverage and document rollout"`.
