# Shared Module Classification Design

Status: Draft for review, based on the agreed conversation scope. Implementation has not started.

## Intent and scope

Maintain a shared module catalog under Master Data and classify an Issue with zero or more modules across SAP and NON-SAP. The same catalog may later classify CRs and Users. Modules are classification metadata only: they do not determine participants, workflow, status, completeness, transport behavior, or user permissions.

Phase one includes catalog maintenance, Issue assignment, Issue detail/report display, filters, export, permissions, and audit. CR and User assignment will be separate follow-up work. Do not create their link tables or infer their assignments in phase one.

## Recommended defaults for review

- Groups are fixed values `SAP` and `NON-SAP`; catalog entries are maintained by authorized users.
- Modules remain optional for both existing and newly created Issues.
- Master fields: group, code, name, optional description, active status, created/updated timestamps.
- Normalize codes with trim and uppercase; trim names; require nonempty code/name. Code is unique within group, including inactive records.
- Group and code are immutable after creation; name, description, and active status are editable. Display resolves current master names rather than storing name snapshots.
- No physical catalog deletion; deactivate and reactivate instead.
- Seed the 12 approved modules below as active records during initial setup. Insert missing `(module_group, code)` records only; never overwrite maintained names, descriptions, or active status on rerun.

## Approved initial catalog

| Group | Code | Name |
|---|---|---|
| SAP | PP | Production Planning |
| SAP | MM | Materials Management |
| SAP | SD | Sales and Distribution |
| SAP | FICO | Finance and Controlling |
| SAP | PM | Plant Maintenance |
| SAP | QM | Quality Management |
| SAP | WM | Warehouse Management |
| SAP | HCM | Human Capital Management |
| SAP | BASIS | Basis |
| SAP | ABAP | ABAP Development |
| NON-SAP | OLAP | OLAP |
| NON-SAP | IT-INVENTORY | IT Inventory |

FICO remains one module. These are editable master records, not hardcoded Issue options; authorized maintainers can add further modules.

## Data and interfaces

Create `module_master` with a fixed-group check and unique `(module_group, code)`; create `issue_module_links` with composite primary key `(issue_id, module_id)`. Issue deletion cascades to links; deleting a referenced module is restricted. Index `(module_id, issue_id)` for filters. Keep schema.sql and an additive migration aligned; rerunning migration must preserve maintained catalog data.

Shared TypeScript types: `ModuleGroup = 'SAP' | 'NON-SAP'`; `ModuleSummary = { id: number; group: ModuleGroup; code: string; name: string; description: string | null; isActive: boolean }`; `ModuleSaveInput = { group: ModuleGroup; code: string; name: string; description?: string; isActive: boolean }`.

Master API: GET/POST `/api/admin/modules`, PUT `/api/admin/modules/:id`. GET requires `master_data.view`; writes require new `master_data.modules`, dependent on `master_data.view`, initially granted to administrators only. Follow existing locked-master permission policy. Issue lookup GET `/api/value-help/modules` requires `issue.view` and returns active records only. Issue responses contain `modules: ModuleSummary[]`, including already assigned inactive modules.

Issue save input adds optional `moduleIds: number[]`. Omission preserves stored links; `[]` clears links; provided arrays replace the set after deduplication. Reject nonpositive/non-safe integers and unknown IDs. Existing inactive assignments may be retained or removed, but new inactive assignments are rejected. Lock catalog rows when validating assignment so concurrent deactivation cannot bypass validation. Save links within the existing Issue transaction and preserve reference permission checks.

Master failures use 400 for invalid input, 404 for absent records, 409 for duplicate code or concurrent invalidation, and 403 for denied permissions. The Issue save path exposes equivalent typed errors rather than converting module errors into generic 500 responses.

Record catalog create/edit/activation changes and Issue module set changes with actor and before/after IDs. Issue assignment audit must use the same transaction as link changes, so failed saves cannot produce success audit entries.

## Frontend

Add `Modules` to Master Data, with group/search/active filters and create/edit forms. Read-only access remains available without manage permission. Use focused components instead of embedding the entire feature into App.tsx or MasterDataWorkspace.tsx.

Add searchable grouped multi-selection labeled `Modules` to Create/Change Issue. Show selected badges and inactive labels. Preserve selection through validation failures, AI/GLPI prefill, detail refresh, and unsaved-change detection. A new sub-Issue starts unassigned; no implicit copying from its parent. Fetch current master options when entering the editor and show retry on lookup failure; do not silently clear selection.

Show modules on Issue detail and as an optional report column. Add filters `moduleGroup`, `moduleIds` (comma-separated query IDs), and `moduleAssignment` (`assigned` or `unassigned`). Selected IDs use ANY matching; group and ID filters combine with AND. Reject unassigned combined with group/IDs. Inactive assigned modules remain available as report filter options. Keep existing filters, pagination, and filter reset behavior.

Use EXISTS for filters and aggregate modules independently to avoid duplicated Issue rows or counts. Export applies the same filters and appends a `Modules` column with stable text such as `SAP: MM; SAP: PP; NON-SAP: OLAP`. Ordering is group, code, then ID. Do not extend dashboard charts or generated document templates in phase one.

## Acceptance and rollout

An authorized maintainer can create/deactivate/reactivate modules; an Issue editor without Master Data access can assign modules. Mixed-group saves and edits persist correctly. Legacy saves preserve links, inactive references remain visible, and Issue report pagination/count/export agree. Participant, lifecycle, completeness, and reference permissions remain unchanged.

Use isolated test fixtures for database migration, transaction, and concurrency checks. Apply schema before deploying code that reads new tables. Do not apply changes to the configured live database during planning. Verify focused tests, existing regression suites, production build, and browser interactions before release.
