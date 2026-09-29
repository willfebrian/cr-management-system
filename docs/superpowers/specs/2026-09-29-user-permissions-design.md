# User Permissions Design

## Purpose and success criteria

CR Management System currently uses `ADMIN` and `USER`, while most authenticated users can use many application operations. Introduce per-account, checkbox-managed permissions for every application feature. Administrators alone maintain accounts and permissions. Creating and releasing SAP CR transports require separate, explicit grants for every account, including administrators.

The change succeeds when each visible feature and its API operation use the same permission decision; a direct API request cannot bypass the UI; existing accounts retain their intended, UI-available non-transport access after migration; and changes to permissions take effect for active sessions on their next request.

## Current application context

- The sidebar includes Dashboard, CR Transport Report/Create/Release, Issue Report/Create/Change, Project Report/Create/Change, Master Data, Settings, Audit Log, and User Management. Project and User Management navigation can be disabled by existing environment flags.
- Users and sessions live in `app_users` and `app_user_sessions`. The role is `ADMIN` or `USER`; `requireAuth` reloads the user for each request. User Management already supports account lifecycle actions and audit history.
- CR Transport Create and Release currently require `ADMIN` in both navigation and their route modules. Some other sensitive endpoints, notably in `/api/admin`, require authentication but no administrator check. The implementation must audit all mounted API routes, including operations reached from dashboards, detail panels, dialogs, exports, and background UI actions.

## Authorization model

Keep `ADMIN` and `USER` as account roles. Store effective grants explicitly per user in a relational `app_user_permissions` table keyed by `(user_id, permission_key)`. A permission catalog in shared code defines stable keys, English labels, groups, dependencies, and whether a permission is restricted to `ADMIN`. Unknown keys are rejected. Absence of a grant means denial. No runtime role-based feature grant is inferred, including for `ADMIN`.

`users.view` and `users.manage` are administrator-only permissions: the server requires both `role = ADMIN` and the relevant grant. `users.manage` includes changing roles, account lifecycle, and assigning permissions. The server prevents any action that would leave no active, unarchived administrator with `users.manage`. This invariant covers permission removal, role demotion, deactivation, and archival. Basic authentication, password change, logout, and an access-limited landing state remain available without feature grants.

The following is the initial catalog. Each row corresponds to a checkbox. Permission keys are stable application identifiers; UI labels are English.

| Group | Permission keys and labels |
| --- | --- |
| Dashboard | `dashboard.view` View Dashboard |
| CR Transport | `transport.view` View Report; `transport.export` Export Report; `transport.create` Create Transport; `transport.release` Release Transport; `transport.sync` Run Sync |
| Issue | `issue.view` View Issues; `issue.export` Export Issues; `issue.create` Create Issue; `issue.edit` Edit Issue; `issue.cancel_delete` Cancel/Delete Issue; `issue.documents` Generate Documents; `issue.reminder` Send Reminder |
| Project | `project.view` View Projects; `project.create` Create Project; `project.edit` Edit Project; `project.cancel_delete` Cancel/Delete Project; `project.documents` Generate CR Transport Document |
| Master Data | `master_data.view` View Master Data; `master_data.people` Manage People; `master_data.group_emails` Manage Group Emails |
| Settings | `settings.target_systems` Manage Target Systems; `settings.general` Manage General Settings; `settings.ai` Manage AI Settings; `settings.templates` Manage Templates; `settings.appearance` Manage Personal Appearance |
| Audit | `audit.view` View Audit Log |
| User Management | `users.view` View Users; `users.manage` Manage Users & Permissions (ADMIN only) |

`transport.create` and `transport.release` are independent. Neither grant implies the other. Both start unchecked for newly created and migrated accounts, even when the role is `ADMIN` or an administrator starter preset is selected. The corresponding view is available to a holder of its action grant; `transport.view` controls the report separately. Preflight, object resolution, candidate lookup, test run, and operation polling require their respective Create or Release grant. Starting or executing a release requires `transport.release`.

The catalog declares parent view dependencies for related actions. For example, `issue.edit` requires `issue.view`. The editor automatically selects a required parent when an action is selected, and explains this in the UI; clearing a parent clears its dependent grants. The server validates the complete grant set before saving and also checks action grants at request time. Transport Create/Release do not depend on the report grant. Admin-only grants cannot be assigned to `USER` accounts. Demoting an administrator removes administrator-only grants in the same transaction; other selected grants remain.

Existing auxiliary actions inherit the permission of their owning workflow: Issue AI draft and GLPI/email lookup are part of Issue creation or editing; issue reminder preview and send use `issue.reminder`; read-only value help uses the feature that requests it. A route inventory in the implementation plan will assign every endpoint to one catalog key or document why it is a basic authenticated operation. No authenticated mutating endpoint remains unrestricted merely because the UI hides it.

## Permission maintenance

Extend the existing User Management workspace with a Permissions panel on the selected user. Display checkboxes grouped by feature, a concise explanation for dependent and administrator-only grants, and Save/Cancel controls. The panel shows the stored grants rather than a role-derived illusion. Only a holder of `users.manage` with `ADMIN` role can edit them. Read-only administrators with `users.view` can inspect account information but cannot modify it.

On account creation or restoration, an administrator chooses a Regular User or Admin starter preset, then can adjust the proposed grants before saving. Presets populate the form once; they do not remain linked to the account and do not override later manual changes. The Regular User preset reflects the current non-admin access, except transport actions. The Admin preset reflects current administrative access, except transport actions. Both include relevant view grants and personal appearance. Role and permission changes are saved atomically. A confirmation summarizes changes to `transport.create`, `transport.release`, and `users.manage` before saving. The server records actor, target, timestamp, and before/after permission keys in user audit history and the general activity log without exposing secrets.

The permissions panel makes transport eligibility easy to maintain: the administrator can search users, see the two transport grants on each user's detail, and filter the user list by those grants. No separate settings menu or hard-coded username allowlist is needed.

## Request and UI flow

Authentication resolves the user's role and current grants from the database. The login and `/api/auth/me` responses include the effective permission key list. A shared client permission helper controls navigation, page entry, action buttons, and redirects when a grant is absent. This UI behavior supports usability only; the server remains authoritative.

Server middleware `requirePermission(key)` checks the current account's grant for each protected route. Route checks must occur before database mutation, SAP RFC, email send, AI call, or sensitive settings read. Multi-operation routes are split or explicitly guarded by the action they perform. Requests without a grant receive HTTP 403 with a stable error code and an English, non-sensitive message. The client refreshes its permission state after a 403 or when the account's grants are saved. A grant revocation is effective on the next API request from an already-open session; no logout is required.

Settings responses must be scoped to authorized settings features. In particular, a user whose only settings permission is personal appearance must not receive target-system credentials, integration configuration, or other administrative settings. The existing `/api/admin` routes need individual read and write guards; the path prefix is not itself an authorization boundary. Audit log access requires `audit.view`.

If an account has no page-view grants, show an access-limited landing page with password change and logout. Direct navigation to an unauthorized view returns to that state or the first permitted view. Changes to an account's own grants are subject to the same last-manager invariant.

## Migration and deployment

The schema migration creates the grant table and populates grants for existing active and inactive, non-archived accounts according to their intended, UI-available non-transport functionality. It does not preserve access to sensitive endpoints that were accidentally under-protected. Existing `ADMIN` accounts receive their current administrator-only capabilities, including `users.manage`; existing `USER` accounts receive the features presently available in the UI. `transport.create` and `transport.release` are deliberately omitted for every account and must be granted afterward by an administrator. Archived accounts do not acquire new grants through migration; restoration uses a selected preset and explicit administrator review.

The migration is idempotent, and account creation after deployment uses explicit preset-selected grants. Deployment should surface to administrators that transport Create and Release are disabled until individually re-granted. The last-manager invariant must be established before switching routes to permission enforcement, so the first administrator can maintain permissions. Existing automated background synchronization is a system process, not a user grant; manually triggered sync uses `transport.sync`.

## Verification

Automated tests cover catalog dependencies, preset values, role restrictions, last-manager protection, migration outcomes, and permission changes during active sessions. Route tests verify 403 for unauthorized direct requests and success for authorized requests, with focused coverage for SAP Create and Release, sync, Issue and Project mutations, user management, settings reads and writes, exports, and audit logs. Client tests verify checkbox behavior, permission-driven navigation, and access-limited state. Run the repository's relevant test suites and build before considering implementation complete.
