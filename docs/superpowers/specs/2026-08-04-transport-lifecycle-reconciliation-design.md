# Transport Lifecycle Reconciliation Design

## Objective

Ensure that CR lifecycle status reflects valid SAP transport imports consistently across the configured landscape:

- DEV is the source system and remains authoritative for CR creation and release.
- QA and PRD are transport targets and are authoritative for their own import evidence.
- A target may be marked `imported` from confirmed SAP transport evidence only when `TPALOG.TRSTEP = 'I'`.
- A previously confirmed step `I` is historical evidence and remains valid even if the request is later removed from SE03/E070.

The first known stale record, `TRDK924576`, must be corrected by the same general reconciliation logic rather than by a CR-specific code path.

## Root Cause

`TRDK924576` currently has these live SAP facts:

- QA contains a successful `TPALOG` import row with step `I`.
- PRD contains no step `I` import row and no current request header.
- The application cache contains a legacy PRD lifecycle row marked `confirmed/imported` from step `U`.

The stale row was created before import-step filtering was added. The current cache refresh preserves every row whose `evidence_source` is `confirmed`, while the existing re-confirmation flow only audits inferred rows. Consequently, a legacy non-import step can remain `In PRD` indefinitely.

## Lifecycle Rules

### Confirmed import

A lifecycle record is confirmed imported only when all conditions hold:

1. The log came from the target server being evaluated.
2. `TRSTEP` is exactly `I` after normalization.
3. The request key matches the DEV parent CR.
4. The return code is mapped using the existing return-code policy.

A successful step `I` remains historical import evidence. A later absence from E070 or SE03 does not downgrade it.

### Pending target

If the DEV parent is released and the target has no valid step `I` evidence, the target status is `pending`. Matching target-cache headers may assist diagnostics and orphan recovery, but must not independently promote the lifecycle to confirmed imported.

### Landscape result

- Released DEV with no QA step `I`: `Pending to QA`.
- Valid QA step `I` with no PRD step `I`: `Pending to PRD`.
- Valid PRD step `I`: `In PRD`.

For `TRDK924576`, the general rules retain QA as imported, downgrade PRD to pending, and produce `Pending to PRD` in the application.

## Data Model

Add a nullable `transport_step` column to `cr_transport_lifecycle`.

The migration runs in this order:

1. Add `transport_step` without a constraint.
2. Add a `NOT VALID` database constraint preventing new or updated `confirmed/imported` rows unless `transport_step = 'I'`; legacy rows remain temporarily allowed until audited.
3. Backfill recognizable legacy messages such as `Confirmed from TPALOG step I` or `step U`.
4. Reconcile every `confirmed/imported` row whose step is null or not `I` against its corresponding target server.
5. Validate the constraint when no unresolved legacy candidate remains. If SAP failures leave unresolved candidates, the constraint stays not-valid for legacy data while continuing to protect all new writes.

Import metadata (`imported_at`, `import_date`, `import_time`, `return_code`) is cleared when a legacy row is downgraded. The reconciliation result is recorded in `message`, `last_checked_at`, and `updated_at` for auditability.

## Sync and Reconciliation Flow

### Normal sync

For both QA and PRD:

1. Query `TPALOG` with `TRSTEP = 'I'`.
2. Normalize returned step values.
3. Apply a second defensive step-I filter at the repository boundary.
4. Upsert only valid import logs and persist `transport_step = 'I'`.
5. Report rejected non-import rows in the sync summary if any reach the repository boundary.

Import state is monotonic per target. If at least one step-I attempt has a successful return code (`0000` through `0004`), the latest successful attempt represents the current imported lifecycle. A later failed retry remains SAP audit evidence but cannot downgrade that target from imported to failed. When no attempt has ever succeeded, the latest failed step-I attempt represents the current failed lifecycle.

This provides defense in depth: an extractor or RFC filter defect cannot promote step `U`, `E`, or another step to imported.

### Legacy reconciliation

Reconciliation operates independently for QA and PRD and selects every imported record that lacks valid confirmed step-I evidence:

- `transport_status = 'imported'`
- `evidence_source IS DISTINCT FROM 'confirmed' OR transport_step IS DISTINCT FROM 'I'`

For each candidate:

1. Query the exact request on the corresponding target server with `TRSTEP = 'I'`.
2. If a valid row exists, replace the legacy metadata with the latest valid import row and persist step `I`.
3. If no valid row exists, downgrade the lifecycle to `pending`, set `evidence_source = 'unknown'`, and clear import metadata.
4. If SAP access fails, leave the row unchanged, count the failure, and retry on a later reconciliation. A connection failure must never be interpreted as proof that an import did not happen.

The deployment process runs the reconciliation job once after applying the schema migration. Full-period sync also retries unresolved legacy candidates in bounded batches. Incremental sync continues to ingest new step-I imports but does not repeatedly audit already valid historical imports.

## Cache Behavior

`refreshTransportLifecycleFromCache` must not promote matching target-cache headers to imported. It preserves valid confirmed step-I rows. Any imported legacy row without confirmed step-I evidence, including inferred rows, is skipped without updating timestamps or metadata until live reconciliation succeeds; this prevents an SAP connection failure from being interpreted as evidence that the import did not happen.

The cache refresh may create or retain pending placeholders, but only the confirmed TPALOG flow may promote them to imported. Once reconciliation downgrades an invalid legacy row to pending, target-cache matching cannot promote it again. Existing valid confirmed step-I rows are never downgraded by cache refresh.

## Reporting and Observability

Extend lifecycle sync results with counts per target:

- valid imports processed
- non-import rows rejected
- legacy candidates checked
- legacy rows confirmed with step `I`
- legacy rows downgraded to pending
- reconciliation failures

Messages must identify the target system and remain free of SAP credentials or connection details.

## Error Handling

- A failure on QA does not prevent PRD reconciliation, and vice versa.
- Individual candidate failures do not roll back successfully reconciled candidates.
- Database updates for one candidate are transactional so lifecycle status and import metadata cannot diverge.
- The sync response distinguishes SAP query failures from a successful query that returns no valid step `I`.

## Testing

Add automated coverage for:

1. Step `I` is accepted as confirmed import.
2. Step `U` and other steps are rejected at the repository boundary.
3. A legacy step `U` with no live step `I` becomes pending.
4. A legacy step `U` with a live step `I` is repaired and remains imported.
5. A valid historical step `I` remains imported when a later query or E070 lookup is empty.
6. QA and PRD are reconciled independently.
7. SAP query failure preserves existing data and increments the failure count.
8. The database constraint rejects invalid confirmed/imported records.
9. `TRDK924576`-shaped data resolves to QA imported, PRD pending, and application lifecycle `Pending to PRD`.

Run focused lifecycle tests, the full test suite, the production build, and a live read-only verification against QA and PRD before completion is reported.

## Non-Goals

- Do not rebuild all historical lifecycle data from scratch.
- Do not downgrade valid step-I history because a request is absent from SE03.
- Do not add CR-specific exceptions for `TRDK924576`.
- Do not alter Issue or Project workflow rules beyond the lifecycle status they already consume.
