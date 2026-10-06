# Shared Module Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maintain a reusable SAP/NON-SAP module catalog and support multi-module Issue classification.

**Architecture:** Use a shared catalog and a dedicated Issue link table, with catalog and assignment logic in focused server modules. Reuse existing Issue save transactions, permission checks, report filtering, and React workspace patterns. CR and User assignment remain future consumers, with no phase-one implementation.

**Tech Stack:** React 19, TypeScript, Express, PostgreSQL/pg, Vite, Node test runner/tsx.

**Spec:** `docs/superpowers/specs/2026-10-06-module-classification-design.md` (draft for user review alongside this plan).

## Global Constraints

- Modules are classification metadata only: they do not determine participants, workflow, status, completeness, transport behavior, or user permissions.
- Modules remain optional for both existing and newly created Issues.
- Groups are fixed values `SAP` and `NON-SAP`; catalog entries are maintained by authorized users.
- No physical catalog deletion; deactivate and reactivate instead.
- Seed the 12 approved catalog records from the spec as active only when missing; never overwrite maintained records on rerun.
- Do not create CR or User link tables or infer their assignments in phase one.
- Use English for all new UI text, documentation, and code comments; converse in Bahasa Indonesia.
- No live database mutation, dependency installation, or unrelated restructuring during planning.
- Use an isolated worktree at execution time and preserve pre-existing changes. Commit only the files belonging to each task.

## Review Focus

- A legacy Issue save omits moduleIds: preserve its links (Task 3).
- A selected module becomes inactive while an Issue is being edited: retain existing links, reject new inactive assignments, preserve the unsaved form (Tasks 3 and 5).
- A cross-module Issue matches several filter values: return one row, correct total, and one export row (Task 6).
- An Issue editor lacks master_data.view: lookup and assignment still work without catalog write access (Tasks 2 and 5).
- Prefill or a failed save changes other form fields: module selection and dirty state remain correct (Task 5).

## File structure

Create shared `src/shared/moduleTypes.ts`; server `src/server/modules/moduleDomain.ts`, `src/server/db/moduleRepository.ts`, `src/server/routes/moduleRoutes.ts`, and `src/server/modules/issueModuleAssignments.ts`. Add reusable client `src/client/api/modules.ts`, `src/client/components/modules/ModulePicker.tsx`, `ModuleBadges.tsx`, `ModuleMasterPanel.tsx`, and `src/client/styles/modules.css`.

Integrate through existing schema, permissions, index, Issue repository/routes/types/API, MasterDataWorkspace, App, reportExportService, and package.json. Do not split unrelated parts of the large existing files.

### Task 1: Catalog schema and domain contract

**Files:** Create `database/migrations/20261006_module_classification.sql`, `src/shared/moduleTypes.ts`, `src/server/modules/moduleDomain.ts`, `scripts/module-schema-contract.test.mjs`, `scripts/module-domain.test.ts`; modify `database/schema.sql`.

**Interfaces:** Produce ModuleGroup, ModuleSummary, ModuleSaveInput as specified; `normalizeModuleInput(input: ModuleSaveInput): ModuleSaveInput`, `normalizeModuleIds(input: unknown): number[]`, and `ModuleError` with status/code. Invalid input throws 400. Array omission is handled by the caller before ID normalization.

- [ ] Write domain tests asserting trim/uppercase (`' pp '` -> `'PP'`), only two valid groups, empty code/name rejected, IDs `[2,2,1]` deduplicated, and negative/fractional/unsafe IDs rejected. Add schema checks for FK deletion policies, group check, composite uniqueness, and reverse index.
- [ ] Run `node scripts/module-schema-contract.test.mjs` and `npx tsx --test scripts/module-domain.test.ts`; confirm failures from missing feature contracts.
- [ ] Implement types, domain validation, additive schema, and idempotent migration. Include the exact 12 approved group/code/name records from the spec in both schema setup and migration, using `ON CONFLICT (module_group, code) DO NOTHING` and active status true for new records.
- [ ] Rerun focused commands; on an isolated PostgreSQL fixture apply migration twice and prove duplicate codes are rejected within one group but permitted across groups. Assert a clean setup has exactly the 12 approved entries with matching names and active status; edit a name and deactivate a record, rerun setup/migration, and assert both maintained values remain unchanged with no duplicate entries.
- [ ] Commit task files: `feat: add shared module catalog schema and domain`.

### Task 2: Master API, permission, and lookup

**Files:** Create `src/server/db/moduleRepository.ts`, `src/server/routes/moduleRoutes.ts`, `scripts/module-routes.test.ts`, `scripts/module-repository.test.ts`; modify `src/shared/permissions.ts`, `src/server/index.ts`, `database/migrations/20261006_module_classification.sql`, relevant existing permission coverage tests.

**Interfaces:** Produce `listModules(filters: { group?: ModuleGroup; active?: boolean; q?: string }): Promise<ModuleSummary[]>`, `createModule(input: ModuleSaveInput, actor: AuthUser): Promise<ModuleSummary>`, `updateModule(id: number, input: ModuleSaveInput, actor: AuthUser): Promise<ModuleSummary>`. Export moduleRoutes, mounted at `/api` with requireAuth. GET admin returns `{rows}`; POST/PUT return ModuleSummary. GET value-help returns `{rows}` of active records.

- [ ] Write route/repository tests for 403 without manage access, successful issue.view-only lookup, unique-code 409, invalid group 400, missing ID 404, immutable group/code, and deactivate/reactivate with persisted audit actor and old/new values.
- [ ] Run `npx tsx --test scripts/module-routes.test.ts scripts/module-repository.test.ts`; confirm RED.
- [ ] Implement repository, routes, typed error mapping, master_data.modules dependency and locked-master policy. Inspect existing stored permission grant migration conventions and grant this key to existing admins only, idempotently; preserve existing user grants. Integrate permission route coverage tests.
- [ ] Run focused tests and `npm run test:integration`; confirm PASS. Verify the new preset and stored-grant behavior with an existing admin fixture.
- [ ] Commit task files: `feat: expose module master API and permissions`.

### Task 3: Transactional Issue assignment and reads

**Files:** Create `src/server/modules/issueModuleAssignments.ts`, `scripts/issue-module-assignment.test.ts`, `scripts/issue-module-read.test.ts`; modify `src/server/db/issueRepository.ts`, `src/server/routes/crRoutes.ts`, `src/server/db/auditRepository.ts` only if a transaction-aware audit helper is needed, `src/shared/types.ts`, `src/client/api.ts`.

**Interfaces:** Produce `replaceIssueModules(client: PoolClient, issueId: number, moduleIds: number[], actor: AuthUser): Promise<void>`. Add moduleIds?: number[] to both IssueSavePayload definitions and modules: ModuleSummary[] to IssueRow. Existing getIssueDetail returns modules on detail.issue; listIssues aggregates the same shape.

- [ ] Write tests for mixed-group assignment, duplicate removal, omission preserving links, [] clearing, inactive existing links retained/removed, inactive new links rejected, unknown IDs rejected, and full rollback of header/links/audit on failure. Include competing assignment/deactivation using two PostgreSQL fixture connections and existing reference permission regression.
- [ ] Run `npx tsx --test scripts/issue-module-assignment.test.ts scripts/issue-module-read.test.ts`; confirm RED.
- [ ] Implement catalog row locking and set replacement inside saveIssue's current transaction; use the transaction connection for assignment audit. Aggregate reads without changing status or completeness SQL; map ModuleError in the HTTP error handler. Ensure deleted Issue links cascade.
- [ ] Rerun tests and `npx tsx --test scripts/issue-reference-permissions.test.ts`; confirm PASS and old consumers can save without moduleIds.
- [ ] Commit task files: `feat: persist Issue module classification atomically`.

### Task 4: Master Data Modules UI

**Files:** Create `src/client/api/modules.ts`, `src/client/components/modules/ModuleMasterPanel.tsx`, `src/client/styles/modules.css`, `scripts/module-master-ui.test.tsx`; modify `src/client/pages/MasterDataWorkspace.tsx` and existing stylesheet entry point.

**Interfaces:** Produce fetchAdminModules(filters), createAdminModule(input), updateAdminModule(id,input) matching Task 2; `ModuleMasterPanel({ canManage }: { canManage: boolean })`. New copy: Modules, Group, Code, Name, Description, Active, Add Module, Edit Module, Deactivate, Reactivate.

- [ ] Write UI tests for view-only vs manage controls, grouped catalog/filter output, immutable edit fields, inactive labels, and server errors leaving input intact.
- [ ] Run `npx tsx --test scripts/module-master-ui.test.tsx`; confirm RED.
- [ ] Implement panel and Master Data tab using existing loading/dialog/notification styles; integrate group, search, and status filters plus create/edit/deactivate/reactivate. Keep Settings tabs unchanged.
- [ ] Rerun focused tests; manually verify keyboard navigation, labels, narrow layout, duplicate-code feedback, and read-only access in browser.
- [ ] Commit task files: `feat: maintain modules in Master Data`.

### Task 5: Issue module picker and detail display

**Files:** Create `src/client/components/modules/ModulePicker.tsx`, `ModuleBadges.tsx`, `scripts/issue-module-picker.test.tsx`, `scripts/issue-module-form.test.ts`; modify `src/client/api/modules.ts`, `src/client/pages/App.tsx`, `src/client/styles/modules.css`.

**Interfaces:** Produce `fetchIssueModuleOptions(): Promise<ModuleSummary[]>`; `ModulePicker({ options, selectedModules, onChange, disabled }: { options: ModuleSummary[]; selectedModules: ModuleSummary[]; onChange: (ids: number[]) => void; disabled?: boolean })`; `ModuleBadges({ modules }: { modules: ModuleSummary[] })`.

- [ ] Write tests for mixed-group selection/removal, retained inactive badges, no newly selectable inactive option, detail-to-form ID mapping, default [] on new/sub-Issue, and existing unsaved-change comparison detecting assignment edits. Test prefill preserving moduleIds and failed save preserving selection.
- [ ] Run `npx tsx --test scripts/issue-module-picker.test.tsx scripts/issue-module-form.test.ts`; confirm RED.
- [ ] Implement grouped searchable picker with checkbox labels; initialize form from detail.issue.modules. Include moduleIds in existing save payload and dirty-state snapshot, reuse badges in detail, fetch options on editor entry, and show retry on lookup failure. Keep existing inactive selections visible; do not reset selections during option refresh.
- [ ] Rerun focused tests and `npx tsx --test scripts/issue-ai-form-policy.test.ts scripts/issue-incomplete-navigation.test.ts`. Browser-check Issue user without master access, AI/GLPI prefill, save failure, reopen, module-only edits, and unchanged participants/completeness.
- [ ] Commit task files: `feat: assign and display modules on Issues`.

### Task 6: Report filters, export, and release verification

**Files:** Create `scripts/issue-module-filter.test.ts`, `scripts/issue-module-export.test.ts`; modify `src/server/db/issueRepository.ts`, `src/server/routes/crRoutes.ts`, `src/server/services/reportExportService.ts`, `src/client/api.ts`, `src/client/pages/App.tsx`, `src/client/api/modules.ts`, `package.json`.

**Interfaces:** Extend client/server IssueFilters with moduleGroup?: ModuleGroup, moduleIds?: number[], moduleAssignment?: 'assigned' | 'unassigned'. Wire query serialization/parsing for comma-separated moduleIds. Reuse fetchAdminModules for master UI; add GET `/api/value-help/modules/report` with issue.view for all active/inactive filter options (Task 2 route file changes). Export summary appends Modules using stable group/code/ID ordering.

- [ ] Write tests for ANY selected IDs, group AND selected IDs, assigned/unassigned, invalid unassigned combinations returning 400, duplicate query IDs, inactive filter options, stable module text, and a multi-module Issue counted once. Verify list/export filter parity and filter reset returning to page 1.
- [ ] Run `npx tsx --test scripts/issue-module-filter.test.ts scripts/issue-module-export.test.ts`; confirm RED.
- [ ] Implement EXISTS filtering shared by count/list/export, API validation/serialization, report option lookup, optional Modules report column, and filter reset/cache key wiring. Append export column without changing existing sheets. Register all new tests in package.json under test:modules and include it in npm test.
- [ ] Run `npm run test:modules`, `npm test`, and `npm run build`; record results and distinguish existing failures from feature regressions. Browser-check maintain -> create mixed-group Issue -> edit -> deactivate -> report filter -> export -> reopen, including keyboard and narrow-screen layouts.
- [ ] On an isolated database verify migration repeatability and Issue delete cascade; record schema-before-code deployment order and rollback approach (revert code while retaining additive tables and links). Do not drop maintained data for rollback.
- [ ] Commit task files: `feat: filter and export Issues by module`.

## Handoff

Review both draft documents before implementation. Recommended execution is native in this session because the six tasks share schema/type/API interfaces and follow existing application patterns. Subagent-driven execution is available if the user prefers per-task independent implementation/review. CR/User linking needs its own later scope review; do not silently copy classification from Issue to either entity.
