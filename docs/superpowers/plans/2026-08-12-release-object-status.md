# Release Object Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display nested SAP objects and their test-run status for each Release child task and parent request.

**Architecture:** Parse backward-compatible `TASK` and `OBJECT` RFC rows in the SAP gateway service. Enrich missing object rows from synchronized E071 data in PostgreSQL, then render them under their owning request with an explicit SAP-vs-task status source.

**Tech Stack:** Node.js, TypeScript, Express, PostgreSQL, React, Node test runner, SAP RFC.

## Global Constraints

- Existing six-column RFC task rows remain supported.
- Object failures block Release.
- Missing SAP object results fall back to synchronized E071 objects with inherited task status.
- All new UI copy is English.

---

### Task 1: RFC result parser

**Files:**
- Modify: `mcp/sap/transport-release-service.mjs`
- Test: `scripts/transport-release-object-status.test.mjs`

**Interfaces:**
- Produces: `ReleaseResult.tasks[].objects[]` with `trkorr`, `pgmid`, `objectType`, `objectName`, `status`, `message`, and `statusSource`.

- [ ] Write tests for legacy task rows and new prefixed TASK/OBJECT rows.
- [ ] Run the focused test and confirm the object contract fails.
- [ ] Implement parsing and aggregation by owning `TRKORR`.
- [ ] Run the focused test and confirm it passes.

### Task 2: Local E071 fallback and API contract

**Files:**
- Modify: `src/server/routes/transportReleaseRoutes.ts`
- Modify: `src/server/sap/transportReleaseService.ts`
- Modify: `src/client/api/transportReleaseApi.ts`
- Test: `scripts/transport-release-object-status.test.mjs`

**Interfaces:**
- Consumes: parsed SAP object rows from Task 1.
- Produces: enriched `ReleaseResult` returned by `/api/cr-transports/release/test-run` and `/execute`.

- [ ] Write a failing test proving synchronized objects inherit their task status when SAP omits object rows.
- [ ] Query `cr_objects` for the parent and its child tasks.
- [ ] Merge synchronized and SAP-returned objects by `TRKORR|PGMID|OBJECT_TYPE|OBJECT_NAME`.
- [ ] Recalculate `hasErrors` from both task and object results.
- [ ] Run the focused test and confirm it passes.

### Task 3: Nested Release result UI

**Files:**
- Modify: `src/client/components/crTransport/CrTransportRelease.tsx`
- Modify: the existing CR Transport stylesheet containing `cr-release-*` rules
- Test: `scripts/transport-release-object-status.test.mjs`

**Interfaces:**
- Consumes: `ReleaseTaskResult.objects`.
- Produces: expandable task rows with object type, name, status, source, and error message.

- [ ] Write a failing SSR test for nested object result content and inherited-status text.
- [ ] Render objects beneath each task while preserving the current visual language.
- [ ] Show `No synchronized objects found for this request.` when empty.
- [ ] Run the focused test and confirm it passes.

### Task 4: Verification and SAP handoff

**Files:**
- Create: `docs/sap/ZRFC_TRANSPORT_REQUEST_RELEASE-object-results.md`

**Interfaces:**
- Produces: exact ABAP output contract for deployment to the SAP function module.

- [ ] Document the two ET_RESULTS formats and stop-on-error rules for ABAP deployment.
- [ ] Run focused tests, production build, and `git diff --check`.
- [ ] Restart the local backend and verify the Test Run UI without executing Release.
