# Project Go-Live Design

## Objective

Replace the frontend-only Project prototype with a production Project domain that persists data, groups Issues, supports create/change/cancel/delete, preserves audit history, and can be deployed independently from the future Project CR Transport document.

## Confirmed Business Rules

- One Issue can belong to at most one active Project.
- Create Project and Change Project can search, add, and remove Issues.
- Removing an Issue changes only the Project relationship; it never deletes or changes the Issue.
- Cancelling a Project requires a reason, makes the Project read-only, releases every active Issue relationship, and preserves those Issues as historical relationships.
- Deleting a Project never deletes an Issue or SAP CR.
- An Issue with an active Project relationship cannot be hard-deleted; the API returns a conflict naming the Project and instructs the user to remove the Issue from that Project first.
- Cancelling an Issue does not silently remove it from its Project. It remains visible as a cancelled linked Issue until explicitly removed through Change Project.
- Authenticated `USER` and `ADMIN` accounts can create, change, and cancel Projects.
- Only `ADMIN` can hard-delete a Project.
- Project Owner is selected from `issue_people`.
- Operational audit actors come from `app_users`.
- Project CR Transport generation is excluded from the first go-live because its template does not exist.
- The Generate action remains hidden until the Project document capability is configured.

## Domain Model

### `project_headers`

| Column | Type | Rule |
|---|---|---|
| `id` | `BIGSERIAL` | Primary key |
| `project_no` | `INTEGER` | Unique yearly number such as `26001` |
| `project_key` | `TEXT` | Unique display key such as `PRJ-26001` |
| `project_name` | `TEXT` | Required |
| `description` | `TEXT` | Optional |
| `owner_person_id` | `BIGINT` | FK to `issue_people` |
| `owner_name_snapshot` | `TEXT` | Required when owner is selected |
| `project_status` | `TEXT` | `planned`, `in_progress`, `on_hold`, `completed`, or `cancelled` |
| `created_by_user_id` | `BIGINT` | FK to `app_users` |
| `created_by_snapshot` | `TEXT` | Audit snapshot |
| `created_at` | `TIMESTAMPTZ` | Defaults to `now()` |
| `updated_by_user_id` | `BIGINT` | FK to `app_users` |
| `updated_by_snapshot` | `TEXT` | Audit snapshot |
| `updated_at` | `TIMESTAMPTZ` | Defaults to `now()` |
| `cancelled_by_user_id` | `BIGINT` | Nullable FK to `app_users` |
| `cancelled_by_snapshot` | `TEXT` | Nullable audit snapshot |
| `cancelled_at` | `TIMESTAMPTZ` | Nullable |
| `cancelled_reason` | `TEXT` | Required when cancelled |

Project numbering follows the Issue yearly convention: the first two digits are the current year and the last three digits increment inside the database transaction. Creation serializes number allocation with a PostgreSQL transaction advisory lock so concurrent requests cannot receive the same number.

### `project_issue_links`

This table contains only current active relationships.

| Column | Type | Rule |
|---|---|---|
| `id` | `BIGSERIAL` | Primary key |
| `project_id` | `BIGINT` | FK to `project_headers`, cascade on Project delete |
| `issue_id` | `BIGINT` | FK to `issue_headers`, restrict on Issue delete while linked |
| `linked_by_user_id` | `BIGINT` | FK to `app_users` |
| `linked_by_snapshot` | `TEXT` | Audit snapshot |
| `linked_at` | `TIMESTAMPTZ` | Defaults to `now()` |

`issue_id` has a unique constraint. The API also locks selected Issue rows during save and returns `409 Conflict` with the owning Project key when an Issue is already assigned.

### `project_issue_link_history`

This table is immutable relationship history.

It stores nullable `project_id` and `issue_id` references with `ON DELETE SET NULL`, plus Project/Issue snapshots, `relation_status` (`active`, `removed`, `cancelled`, `deleted`), actor snapshots, `linked_at`, `unlinked_at`, and an optional reason. A current link has one matching `active` history row. Add, remove, cancel, and delete close or append history inside the same transaction as the current-state change.

### `project_status_history`

Stores `project_id`, Project snapshots, `from_status`, `to_status`, reason, actor, and timestamp. Project deletion keeps the snapshot record by setting `project_id` to null.

## Status Model

Project status is explicitly maintained and is not derived from Issue status:

- `planned`: initial planning or no delivery work started.
- `in_progress`: delivery work is active.
- `on_hold`: delivery is temporarily paused.
- `completed`: Project delivery is complete.
- `cancelled`: terminal, read-only status set only through the cancel operation.

Create defaults to `planned`. Normal edit cannot set `cancelled`. A cancelled Project cannot be edited, receive Issues, or generate documents.

## Repository and Transaction Rules

`projectRepository.ts` owns all Project SQL and exports:

```ts
listProjects(filters: ProjectFilters): Promise<ProjectListResult>
getProjectDetail(id: number): Promise<ProjectDetail>
searchProjectIssueOptions(query: string, excludeProjectId?: number): Promise<ProjectIssueOption[]>
saveProject(payload: ProjectSavePayload, actor: AuthUser): Promise<ProjectDetail>
cancelProject(id: number, reason: string, actor: AuthUser): Promise<ProjectDetail>
deleteProject(id: number, actor: AuthUser): Promise<{ ok: true; id: number }>
```

`saveProject` uses one transaction to:

1. Validate required fields and status.
2. Verify the owner exists and is active.
3. Lock all selected Issue rows.
4. Reject cancelled or nonexistent Issues.
5. Reject Issues assigned to another active Project.
6. Insert or update the Project header.
7. Calculate added and removed Issue IDs.
8. Replace current links and write immutable history.
9. Write status history when the status changes.

`cancelProject` changes status, writes status history, closes all active relationship history as `cancelled`, and removes current links.

`deleteProject` is called only after admin middleware. It closes active history as `deleted`, deletes the Project header and current links, and retains snapshot histories.

## API Contract

All Project endpoints require authentication:

```text
GET    /api/projects
GET    /api/projects/:id
GET    /api/projects/issue-options
POST   /api/projects
PUT    /api/projects/:id
POST   /api/projects/:id/cancel
DELETE /api/projects/:id
```

The delete route additionally uses `requireAdmin`.

List filters support `q`, `status`, `page`, and `pageSize`. Issue options support `q` and optional `excludeProjectId`. Create/update accept:

```ts
type ProjectSavePayload = {
  id?: number;
  projectName: string;
  description?: string;
  ownerPersonId: number;
  projectStatus: "planned" | "in_progress" | "on_hold" | "completed";
  issueIds: number[];
};
```

Expected errors:

- `400` for invalid fields, status, owner, or cancelled Issue.
- `401` for unauthenticated requests.
- `403` for non-admin delete.
- `404` for missing Project.
- `409` when an Issue belongs to another Project.
- `409` when hard-deleting an Issue that is still linked to an active Project.

## Client Design

The mock data and `ProjectPrototype` state are replaced with API-backed Project components:

- `ProjectReport`: paginated list/detail workspace, filters, selected state, and historical relationship display for cancelled Projects.
- `ProjectEditor`: shared Create/Change form with dirty-state navigation protection.
- `ProjectIssuePicker`: debounced Issue search, selected Issue list, add/remove actions, and ownership conflict labels.
- `ProjectActions`: status-aware More menu with cancel and admin-only delete.

The Issue picker displays Issue key, name, status, requester/ABAPer context, primary CR, and owning Project when unavailable. Selection remains client-side until Save; the server revalidates all selections transactionally.

Cancelled Projects are read-only. Historical Issues remain visible with a relationship-status label. Delete confirmation requires typing the exact `project_key`.

## Document Capability

Project CR Transport generation is a separate post-go-live phase.

The first release does not create an endpoint, dummy template, or disabled Generate button. The future integration will add a Project document data assembler, a local template-validation sandbox, and `GET /api/projects/:id/templates/cr-transport` only after the template and placeholder contract are approved.

## Security and Audit

- Every mutation reads the actor from `req.authUser`; actor IDs or names supplied by the client are ignored.
- Delete is protected server-side with `requireAdmin`; hiding the UI control is not the authorization boundary.
- Repository queries are parameterized.
- Current links and their history update in one transaction.
- API responses do not expose unnecessary authentication fields.

## Migration and Rollout

1. Back up the production PostgreSQL database.
2. Run schema contract tests locally.
3. Apply the additive schema to a staging copy.
4. Verify tables, constraints, indexes, and rollback procedure.
5. Deploy API while the Project navigation remains behind a client feature flag.
6. Run API and browser UAT.
7. Enable the real Project UI and remove mock data.
8. Monitor API errors and relationship conflicts.

Existing prototype Projects are not seeded automatically. Production begins with an empty Project list unless a separately reviewed seed/import file is supplied.

## Verification

- Unit tests for validation, status transitions, relationship diffing, and error mapping.
- Schema contract tests for tables, FKs, unique constraints, and indexes.
- Repository integration tests against a disposable PostgreSQL schema.
- Route tests for authentication, admin delete, Project assignment conflict, linked-Issue delete conflict, and response shapes.
- React tests for report loading, Issue picker, add/remove, cancelled read-only state, and delete visibility.
- Full `npm test` and `npm run build`.
- Browser QA for Report/Create/Change, conflict handling, cancel, admin delete, responsive layout, and console errors.
