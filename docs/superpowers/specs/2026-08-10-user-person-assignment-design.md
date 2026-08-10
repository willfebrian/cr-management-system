# User–Person Assignment Design

## Objective

Connect login accounts managed in User Management (`app_users`) with the people master data in `issue_people`. An account may remain unassigned, but once assigned the relationship is one-to-one: one account belongs to at most one person, and one person belongs to at most one account.

This first enhancement provides a dedicated post-creation assignment workflow. Creating an account does not require selecting a person.

## Existing Context

- `app_users` stores authentication identity, role, lifecycle status, and archive state.
- `issue_people` stores business identity, including `full_name`, `nickname`, email, department, active status, and business-role flags.
- User Management already supports create, profile edit, activation, password reset, session revocation, archive/restore, and account audit history.
- The two records currently have no relational link.

## Scope

### Included

- Optional one-to-one account-to-person relationship.
- ADMIN-only assign, reassign, and unassign actions.
- Person search by full name and nickname.
- Assignment status in the user list and user detail.
- Confirmation before all assignment mutations.
- User Management audit entries for assignment changes.
- Database and service-level concurrency protection.
- Protection against deleting a linked person.

### Excluded

- Requiring a person during account creation.
- Automatic assignment based on username, email, full name, or nickname.
- Self-service assignment by ordinary users.
- Changing authentication, authorization, password, or session behavior based on the linked person.
- Automatically unassigning a person when an account is archived.
- Historical assignment-period tables beyond the existing audit log.

## Data Model

Add a nullable `person_id` column to `app_users`:

```sql
ALTER TABLE app_users
  ADD COLUMN person_id BIGINT REFERENCES issue_people(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX idx_app_users_person_unique
  ON app_users (person_id)
  WHERE person_id IS NOT NULL;
```

The nullable column permits existing and new accounts to remain unassigned. The partial unique index enforces that one person cannot be assigned to multiple accounts. Because a row has only one `person_id`, an account cannot be assigned to multiple people.

The migration does not infer or backfill assignments. Existing accounts begin unassigned.

The relationship remains attached when an account is inactive or archived. Restoring the account therefore restores the same business identity. A linked person cannot be deleted until an ADMIN unassigns the account. The existing person-deletion API must translate this foreign-key restriction into a clear conflict response rather than returning a generic server error.

## Shared Contracts

Extend `ManagedUser` with a nullable linked-person summary:

```ts
type ManagedUserPerson = {
  id: number;
  fullName: string | null;
  nickname: string | null;
  email: string | null;
  isActive: boolean;
};

type ManagedUser = {
  // existing fields
  person: ManagedUserPerson | null;
};
```

Person search results include assignment ownership so the UI can explain why an option is unavailable:

```ts
type ManagedUserPersonOption = ManagedUserPerson & {
  assignedUser: {
    id: number;
    username: string;
    deletedAt: string | null;
  } | null;
};
```

Add these audit actions:

```text
PERSON_ASSIGNED
PERSON_REASSIGNED
PERSON_UNASSIGNED
```

Audit metadata records nullable previous and next values:

```ts
type PersonAssignmentAuditMetadata = {
  previousPersonId: number | null;
  previousPersonName: string | null;
  nextPersonId: number | null;
  nextPersonName: string | null;
};
```

The stored name is a display snapshot. It uses full name when available, with nickname shown as supporting context; if full name is absent, nickname becomes the display name.

## Backend Components

### User Management service

Extend user reads to left join `issue_people` and return the linked-person summary. User search must match username, `full_name`, or `nickname`, while preserving the existing pagination, role, status, and archive filters.

Add three service operations:

```ts
listManagedUserPersonOptions(
  query: string,
  actor: ManagementActor
): Promise<ManagedUserPersonOption[]>;

assignManagedUserPerson(
  userId: number,
  personId: number,
  actor: ManagementActor
): Promise<ManagedUser>;

unassignManagedUserPerson(
  userId: number,
  actor: ManagementActor
): Promise<ManagedUser>;
```

All operations require an ADMIN actor.

Person options are ordered by `coalesce(full_name, nickname)` and filtered case-insensitively against both full name and nickname. The endpoint returns active and inactive people so an existing inactive relationship can still be understood, but inactive people cannot be newly assigned.

### Assignment transaction

Assignment and reassignment run in one database transaction:

1. Lock the target `app_users` row with `FOR UPDATE`.
2. Reject a missing or archived target account.
3. Lock the selected `issue_people` row with `FOR UPDATE`.
4. Reject a missing or inactive person.
5. Check whether another account already references the selected person.
6. Update `app_users.person_id`.
7. Insert the appropriate User Management audit event using previous and next snapshots.
8. Return the refreshed managed user.

The database unique index is the final race-condition guard. Any unique-constraint conflict is translated into an HTTP `409` assignment conflict.

Assigning the person already linked to the target account is an idempotent success and does not add a duplicate audit entry.

Unassignment locks the target account, rejects a missing or archived account, clears `person_id`, and records `PERSON_UNASSIGNED`. Unassigning an already-unassigned account is an idempotent success without a duplicate audit entry.

## API

Add ADMIN-only routes under the existing authenticated User Management router:

```text
GET    /api/users/person-options?q=<search>
PUT    /api/users/:id/person
DELETE /api/users/:id/person
```

Assignment request:

```json
{
  "personId": 123
}
```

`PUT` handles both initial assignment and reassignment. Both mutation routes return the updated `ManagedUser`.

Error behavior:

| Situation | Status | Message intent |
|---|---:|---|
| Actor is not ADMIN | 403 | Administrator access required |
| User does not exist or is archived | 404 | User is unavailable for assignment |
| Person does not exist | 404 | Person not found |
| Person is inactive | 409 | Inactive person cannot be assigned |
| Person belongs to another account | 409 | Identify the owning username |
| Linked person deletion attempted | 409 | Unassign the account before deleting the person |
| Invalid user or person ID | 400 | ID must be a positive integer |

## User Interface

### User list and search

Each user row shows the linked identity beneath the username, formatted as `Full Name (Nickname)` when both are available. Unassigned accounts show an `Unassigned` badge. If a linked person is inactive, show an `Inactive person` warning without breaking the existing account-status display.

The existing User Management search field searches username, full name, and nickname through the server list endpoint.

### User detail

Add a `Linked Person` section displaying:

- full name;
- nickname;
- email;
- person active status.

An unassigned account shows an empty state and an `Assign Person` button. An assigned account shows `Change Assignment` and `Unassign` actions.

Archived accounts display their linked identity read-only. Assignment mutation actions are unavailable until the account is restored.

### Assignment dialog

The dialog supports search by full name or nickname and displays each person's full name, nickname, email, active status, and assignment status.

- Available active people can be selected.
- Inactive people remain visible but disabled.
- People assigned to another account remain visible but disabled, with the owning username shown.
- The person currently assigned to the target account is visibly marked.

The ADMIN must confirm every mutation:

- initial assignment: `Account → Person`;
- reassignment: `Previous Person → New Person`;
- unassignment: `Person → Unassigned`.

After success, the workspace refreshes the user list, selected-user detail, and audit history while keeping the same user selected.

## Person Management Integration

The existing People master-data deletion route must catch the linked-person foreign-key violation and return HTTP `409` with a message telling the ADMIN which account must be unassigned. Editing a linked person's name, nickname, email, flags, or active status remains allowed.

If a linked person is later marked inactive, the assignment remains intact. User Management shows the warning, and the ADMIN may unassign or reassign the account to an active person.

## Security and Audit

- Existing authentication middleware remains unchanged.
- Only ADMIN can search assignment candidates or mutate assignments.
- Password hashes and session records never enter assignment responses or audit metadata.
- Every effective assignment change records the actor, target user, action, previous identity snapshot, next identity snapshot, and timestamp in `app_user_audit_logs`.
- Account archive/restore does not generate assignment audit events because it does not change the relationship.

## Testing Strategy

### Schema contracts

- `app_users.person_id` is nullable and references `issue_people(id)` with delete restriction.
- The partial unique index permits multiple nulls but rejects the same non-null person on two accounts.
- Migration leaves all existing users unassigned.

### Domain and service tests

- ADMIN authorization is required.
- Full-name and nickname searches are case-insensitive.
- Managed-user list search includes linked full name and nickname.
- Active available person can be assigned.
- Assigned active person can be replaced with another available active person.
- Assignment and reassignment return the refreshed linked-person summary.
- Inactive, missing, or already-owned people are rejected with the defined status.
- Archived and missing users cannot be mutated.
- Repeating the current assignment is idempotent and creates no audit row.
- Unassigning twice is idempotent and creates no duplicate audit row.
- Concurrent assignment attempts cannot assign one person to two accounts.
- Assignment, reassignment, and unassignment record correct audit snapshots.
- Existing archive, restore, profile, status, password, and session behavior remains unchanged.

### Route and client tests

- IDs and assignment payloads are validated.
- Status codes and conflict messages follow the API contract.
- API client calls use the correct methods, routes, and payloads.
- Linked-person deletion produces a clear `409` response.

### UI tests

- Assigned and unassigned states render correctly in list and detail.
- Full-name/nickname search results render candidate context.
- Inactive and already-owned options are disabled with explanations.
- Confirmation content correctly represents assign, reassign, and unassign actions.
- Successful mutation keeps the target user selected and refreshes list, detail, and audit.
- Errors remain visible in the dialog without discarding the current selection.

## Rollout

1. Apply the additive nullable-column migration and unique index.
2. Deploy backend reads, assignment routes, validation, and deletion-conflict handling.
3. Deploy shared/client contracts and User Management UI.
4. Verify existing accounts appear as `Unassigned` and continue authenticating normally.
5. ADMIN assigns accounts manually over time; no bulk backfill is required.

## Acceptance Criteria

- An account can exist and authenticate without a linked person.
- ADMIN can assign one available active person to an unassigned current account.
- ADMIN can confirm and perform reassignment or unassignment.
- A person cannot be assigned to two accounts, including under concurrent requests.
- Archived accounts retain their links but cannot change them until restored.
- Inactive linked people remain linked and are visibly flagged.
- A linked person cannot be deleted until the relationship is removed.
- User search matches username, linked full name, and linked nickname.
- Effective assignment changes appear in User Management audit history.
- Existing authentication and User Management lifecycle behavior continues to pass regression tests.
