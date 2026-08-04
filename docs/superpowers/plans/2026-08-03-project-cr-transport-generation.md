# Project CR Transport Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a Project-specific CR Transport DOCX from the approved Word template, while blocking incomplete data through a navigable readiness modal.

**Architecture:** Add a server-side readiness service that resolves the Project, all active linked Issues, and all unique CR SAP records into a deterministic document model. Reuse the existing OOXML ZIP replacement primitives, clone the CR prototype row for every unique CR, and expose readiness/download endpoints consumed by Project actions. The client keeps Generate enabled, downloads immediately when ready, and otherwise opens a grouped modal whose Issue-backed items navigate to the exact Issue Change section.

**Tech Stack:** TypeScript, Express, React, Node ZIP/OOXML utilities, existing PostgreSQL repositories, Node test runner.

## Global Constraints

- First Issue is the active linked Issue with the smallest Issue number; Latest Issue is the active linked Issue with the largest Issue number.
- Only yellow-highlighted template placeholders are replaced and their highlights removed; existing typography and the grouped diagram are preserved.
- All unique involved CR SAP records are included, deduplicated by SAP system and transport number.
- Generate remains clickable. Incomplete data opens a blocking error modal; complete data downloads the DOCX immediately.
- Empty non-highlighted/manual fields do not block generation.

---

### Task 1: Readiness and document model

**Files:**
- Create: `src/server/templates/projectCrTransportService.ts`
- Modify: `src/shared/projectTypes.ts`
- Test: `scripts/project-cr-transport-readiness.test.ts`

- [ ] Write failing tests for First/Latest selection, unique CR ordering, yellow-placeholder completeness, and grouped navigation targets.
- [ ] Run the focused test and confirm it fails because the service contract is absent.
- [ ] Implement the deterministic readiness/document model using full Issue and CR details.
- [ ] Run the focused test and confirm it passes.

### Task 2: DOCX generation

**Files:**
- Modify: `src/server/templates/crTransportTemplateService.ts`
- Modify: `src/server/templates/projectCrTransportService.ts`
- Test: `scripts/project-cr-transport-document.test.ts`

- [ ] Write failing tests for cross-run replacement, highlight removal, CR prototype-row cloning, placeholder-row removal, and grouped-diagram preservation.
- [ ] Run the focused test and confirm it fails for missing Project generation.
- [ ] Extract reusable OOXML ZIP helpers and implement Project DOCX generation.
- [ ] Run the focused test and confirm it passes.

### Task 3: API endpoints

**Files:**
- Modify: `src/server/routes/projectRoutes.ts`
- Modify: `src/client/api/projectApi.ts`
- Test: `scripts/project-routes.test.ts`
- Test: `scripts/project-api-contract.test.ts`

- [ ] Write failing route/API tests for readiness JSON and DOCX download.
- [ ] Run the focused tests and confirm the new contracts fail.
- [ ] Add authenticated readiness and generation endpoints with safe filenames and readiness conflict responses.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Generate action and navigable readiness modal

**Files:**
- Modify: `src/client/components/projects/ProjectActions.tsx`
- Modify: `src/client/components/projects/ProjectReport.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles/project.css`
- Test: `scripts/project-actions.test.tsx`

- [ ] Write failing component tests for always-enabled Generate, direct download on ready, grouped modal on incomplete, and Issue navigation.
- [ ] Run the focused test and confirm the new UI behavior fails.
- [ ] Implement Generate and the accessible readiness modal with clickable Issue items.
- [ ] Run the focused test and confirm it passes.

### Task 5: Regression and visual verification

**Files:**
- Modify: `scripts/regression-navigation-and-cr-sort.test.mjs`
- Modify: `package.json`

- [ ] Replace the old “generation deferred” assertion with the active Project generation contract.
- [ ] Run all Project tests, the full build, and the full regression suite.
- [ ] Generate fixture DOCX files for one and multiple CR rows.
- [ ] Render every generated DOCX page and visually inspect typography, tables, diagram, page breaks, and clipping.

