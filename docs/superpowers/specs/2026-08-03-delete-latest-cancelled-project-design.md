# Delete Latest Cancelled Project Design

## Goal

Allow an administrator to delete a cancelled Project only when it has the highest Project number, so the next Project creation can reuse that number instead of leaving a gap.

## Authorization and lifecycle rules

- The API remains protected by administrator authorization.
- A Project can be deleted only when its status is `cancelled`.
- The cancelled Project must have the highest `project_no` currently present in `project_headers`.
- Active, completed, or otherwise non-cancelled Projects cannot be deleted.
- Older cancelled Projects remain immutable and cannot be deleted because reusing their number would conflict with later Project numbers.

## API and UI contract

Project rows expose `canDelete`, calculated by the server from status and current highest Project number. The Project UI shows `Delete Project` to an administrator only when `canDelete` is true. Other cancelled Projects continue to display the read-only state.

The delete endpoint validates the same rules again inside its transaction. UI eligibility is advisory; the transactional backend check is authoritative and protects against concurrent Project creation or deletion.

## Number reuse

Project creation continues to use the existing advisory lock and `MAX(project_no) + 1` calculation. Once the highest Project is deleted, that number naturally becomes the next number without modifying historical Project numbers.

## History and integrity

Deletion preserves relationship and status snapshots through the existing history tables. It never deletes linked Issues or SAP CR records. The Project header itself is removed only after the historical relationship rows have been closed.

## Error handling

The repository returns a typed conflict when the Project is not cancelled or is no longer the highest-numbered Project. Missing Projects continue to return `404`.

## Testing

- ADMIN UI shows delete for the latest cancelled Project.
- USER UI never shows delete.
- Older cancelled and non-cancelled Projects are read-only/not deletable.
- Repository accepts deletion of the latest cancelled Project.
- Repository rejects non-cancelled and non-latest Project deletion.
- Route remains protected by administrator middleware.
- Creation continues to select the deleted highest number through `MAX(project_no) + 1`.
