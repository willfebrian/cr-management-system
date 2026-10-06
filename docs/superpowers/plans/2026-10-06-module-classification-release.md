# Module classification release notes

Approved scope: reusable SAP/NON-SAP catalog and optional many-to-many Issue classification. CR and User links are reserved for a later phase. Classification does not change participants, workflow, completeness, or permissions outside catalog administration.

## Delivered

- Master Data Modules: create, edit, search/filter, deactivate/reactivate, immutable group/code, transaction-bound audit.
- Twelve initial modules: SAP PP, MM, SD, FICO, PM, QM, WM, HCM, BASIS, ABAP; NON-SAP OLAP and IT-INVENTORY.
- Issue create/edit: mixed-group selection, retained inactive assignments, transactional save, read-only detail summary.
- Issue Report: group/module/assignment filters, optional Modules column, Modules appended to Excel export.
- Admin-only catalog management permission; Issue lookup remains available through issue.view.

## Verification on 2026-10-06

Full npm test passed. The module suite passed 21 tests with the isolated PostgreSQL fixture enabled. npm run build passed (TypeScript and production Vite build); Vite reported its large-chunk advisory.

Real PostgreSQL verification covered repeatable migration/seeding without overwriting maintained values, catalog CRUD/uniqueness, Issue save/read, omitted assignments, inactive assignments, atomic rollback including audit, duplicate-free filtering and counts, actual Excel contents, concurrent deactivation locking, and deletion cascade.

Browser verification used an isolated schema and fixture account: catalog create/edit/deactivation, mixed SAP/NON-SAP Issue save/reopen, inactive badges, report filtering, optional Modules column, actual read-only detail modal, and selection remove/re-add followed by navigation without a false unsaved warning. The browser download event timed out; export contents were verified through backend integration instead. Narrow viewport and dedicated keyboard traversal were not separately verified. Production-scale query performance was not benchmarked.

A fresh review identified two important issues, both fixed with regression tests: inconsistent module-ID ordering caused false dirty state, and the read-only Issue Detail modal lacked the module summary.

## Deployment and reversal

The primary application database has not been migrated by this work. Apply database/migrations/20261006_module_classification.sql in a transaction with search_path set to the application's configured schema, before deploying the new code. The migration is additive and repeatable; existing Issues remain unassigned.

For reversal after deployment, restore the prior application code (base commit 72300a346c8ecc9f5426507f6f3331324be43217, or revert the feature's code commits). Retain module_master, issue_modules, and their data. The prior code ignores those tables. Keep the additive permission data with the tables. Do not drop classification data during a normal reversal. A subsequent redeployment can reuse it. Full data deletion would require a separately approved destructive migration.

## Implementation rulings

- PowerShell replaced Bash bookkeeping because Bash was unavailable.
- The existing dependency junction avoided a redundant installation.
- IssueRow.modules remains optional for legacy fixtures; server responses include module arrays.
- Schema/read/concurrency checks share one real PostgreSQL fixture rather than separate planned files.
- Audit writes use the transaction client directly because the existing helper is best-effort.
- Docker was unavailable; an authorized real PostgreSQL connection provided isolated verification.
- A sandbox-denied connection was retried with network permission before evaluating availability.
- The temporary preview used an esnext optimizer target for an existing editor dependency.
- Review excluded future CR/User linking and unchanged participant/workflow behavior as approved scope boundaries.

## Deferred minor review items

- Expand compressed component/domain formatting for readability.
- Add an explicit module-options Refresh control after an inactive-module save rejection. Lookup failures already expose Retry; users can remove the rejected selection or reopen the editor.

The integration branch is codex/module-classification, based on master. Local merge, remote push/PR, and deployment remain separate integration decisions.
