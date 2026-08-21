# SAP Release Operation Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SAP transport release a one-click tracked operation that waits for SAP confirmation, reports success/failure/timeout, prevents duplicate submissions, and queues CR synchronization only after success.

**Architecture:** Persist release operations in PostgreSQL and expose start/status endpoints. A backend worker executes the existing RFC once, stores phase/result transitions, and queues the existing DEV/QA/PRD incremental sync after SAP success without making sync part of the release result. The RFC verifies E070 after every release call, including asynchronous non-zero return paths, and treats an already released request as idempotent success.

**Tech Stack:** TypeScript, Express, PostgreSQL, React, Node test runner, ABAP RFC, SAP CTS.

**Spec:** `docs/superpowers/specs/2026-08-21-release-operation-status-design.md`

## Global Constraints

- Preserve the existing Release page and modal layout.
- Release order remains child tasks first, then parent.
- Only SAP-confirmed `R` or `N` status is success.
- Sync CR runs after release success and cannot change release success into failure.
- Deploy the RFC to DEV AIX and DEV NC with backup, syntax/read-back, and runtime verification.

---

### Task 1: SAP Release Confirmation Semantics

**Files:**
- Modify: `scripts/transport-release-object-status.test.tsx`
- Modify: `sap/abap/zrfc_transport_request_release/ZRFC_TRANSPORT_REQUEST_RELEASE.abap`

**Interfaces:**
- Consumes: `TR_RELEASE_REQUEST`, `E070-TRSTATUS`.
- Produces: `ET_RESULTS` rows with `RELEASED` or `ERROR`; `EV_MESSAGE` values `RELEASE_COMPLETE`, `PARTIAL_RELEASE_TASK_FAILED`, or `RELEASE_CONFIRMATION_TIMEOUT`.

- [ ] **Step 1: Write failing source-contract tests**

Assert that E070 verification is not guarded by `LV_SUBRC = 0 OR LV_SUBRC = 12`, that the initial parent `R/N` branch returns idempotent success in RELEASE mode, and that diagnostic rows retain `Release failed RC`.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npx tsx --test scripts/transport-release-object-status.test.tsx`

- [ ] **Step 3: Implement bounded confirmation polling**

Poll E070 after each release call regardless of the immediate return code. If status reaches `R/N`, mark the task released and continue. If the bounded wait expires, return a detailed error containing the SAP return code. When the parent is already `R/N` at entry in RELEASE mode, emit a released parent row with `EV_SUCCESS = 'X'` and `EV_MESSAGE = 'RELEASE_COMPLETE'`.

- [ ] **Step 4: Run the focused test and confirm pass**

Run: `npx tsx --test scripts/transport-release-object-status.test.tsx`

### Task 2: Persistent Release Operation Model

**Files:**
- Modify: `database/schema.sql`
- Create: `database/migrations/20260821_release_operations.sql`
- Create: `src/server/sap/transportReleaseOperationRepository.ts`
- Create: `scripts/transport-release-operation.test.ts`

**Interfaces:**
- Produces: `ReleaseOperation` with `id`, `trkorr`, `targetSystem`, `status`, `phase`, `message`, `result`, `syncStatus`, timestamps.
- Produces: `createOrGetActiveReleaseOperation`, `updateReleaseOperation`, and `findReleaseOperation` repository functions.

- [ ] **Step 1: Write failing repository/domain tests**

Cover active-operation reuse for the same `(target_system, trkorr)`, terminal state persistence, and JSON release result storage.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx tsx --test scripts/transport-release-operation.test.ts`

- [ ] **Step 3: Add schema and repository implementation**

Create `release_operations` with statuses `queued`, `running`, `succeeded`, `failed`, `timed_out`; phases `queued`, `releasing_children`, `releasing_parent`, `verifying`; JSONB result; separate background sync status; and a partial unique index preventing more than one active operation per target/request.

- [ ] **Step 4: Run tests and confirm pass**

Run: `npx tsx --test scripts/transport-release-operation.test.ts`

### Task 3: Asynchronous Release API and Background Sync Isolation

**Files:**
- Create: `src/server/sap/transportReleaseOperationService.ts`
- Modify: `src/server/routes/transportReleaseRoutes.ts`
- Modify: `src/server/sap/transportReleaseService.ts`
- Modify: `scripts/transport-release-operation.test.ts`

**Interfaces:**
- Produces: `POST /api/cr-transports/release/operations` returning `{ operation }`.
- Produces: `GET /api/cr-transports/release/operations/:id` returning `{ operation }`.
- Consumes: `executeRelease(trkorr, targetSystem)` and `runCrSync(transportCreateSyncOptions())`.

- [ ] **Step 1: Write failing operation-service and route tests**

Cover immediate start response, duplicate start returning the same operation, success before sync completion, terminal failure detail preservation, timeout classification, and sync failure remaining separate from release success.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx tsx --test scripts/transport-release-operation.test.ts`

- [ ] **Step 3: Implement operation worker and endpoints**

Persist `queued`, transition through `running/verifying`, execute RFC once, store the complete result, and mark success before queueing sync. Convert backend runtime timeout to `timed_out`. Keep the legacy execute endpoint compatible while the frontend migrates.

- [ ] **Step 4: Run tests and confirm pass**

Run: `npx tsx --test scripts/transport-release-operation.test.ts`

### Task 4: Frontend Polling and Terminal Notification

**Files:**
- Modify: `src/client/api/transportReleaseApi.ts`
- Modify: `src/client/components/crTransport/CrTransportRelease.tsx`
- Modify: `scripts/transport-release-object-status.test.tsx`

**Interfaces:**
- Consumes: `startReleaseOperation(trkorr, targetSystem)` and `fetchReleaseOperation(id)`.
- Produces: modal states `Release in progress`, `Released successfully`, `Release failed`, and `Release confirmation timed out`.

- [ ] **Step 1: Write failing rendering and polling-state tests**

Assert that processing includes the current phase, success says synchronization is running in the background when queued, timeout has distinct copy, and terminal release results render task diagnostics.

- [ ] **Step 2: Run focused frontend tests and confirm failure**

Run: `npx tsx --test scripts/transport-release-object-status.test.tsx scripts/transport-release-operation.test.ts`

- [ ] **Step 3: Implement start-and-poll behavior**

Start once, retain the operation id, poll every two seconds, disable confirmation/close while active, and stop polling only on a terminal state. On SAP success, show success immediately, refresh candidates, and report background sync independently.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `npx tsx --test scripts/transport-release-object-status.test.tsx scripts/transport-release-operation.test.ts`

### Task 5: Verification and SAP Deployment

**Files:**
- Modify if required: `scripts/deploy-zrfc-release-object-status.mjs`
- Generated backup: `sap/abap/zrfc_transport_request_release/backups/<timestamp>-<target>-<include>.abap`

**Interfaces:**
- Consumes: final local ABAP source and configured DEV AIX/DEV NC connections.
- Produces: deployed, read-back-verified RFC on both SAP development systems.

- [ ] **Step 1: Run release-focused tests and build**

Run: `npx tsx --test scripts/transport-release-object-status.test.tsx scripts/transport-release-operation.test.ts scripts/transport-release-candidate-system.test.ts`

Run: `npm run build`

- [ ] **Step 2: Apply the database schema**

Run: `npm run db:schema`

- [ ] **Step 3: Deploy RFC to DEV AIX and DEV NC**

Run the guarded deployment script with its explicit `--apply` and confirmation arguments, preserving backups and verifying source read-back/runtime probes.

- [ ] **Step 4: Verify services and working tree**

Confirm backend/frontend health, inspect release-operation API behavior without releasing an additional production-like request, and run `git status --short` to report only intended changes.
