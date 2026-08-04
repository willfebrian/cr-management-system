# Project Action Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Project Report action button row with the same compact vertical-ellipsis dropdown pattern used by Issue Report.

**Architecture:** `ProjectActions` owns the dropdown state and every Project lifecycle/document action. `ProjectReportView` passes its Change callback into that component, eliminating the separate Change button while preserving existing dialogs and authorization rules.

**Tech Stack:** React 19, TypeScript, lucide-react, Node test runner, server-side React test rendering.

## Global Constraints

- Reuse `detail-action-menu`, `detail-icon-action`, and `detail-action-menu-list` from Issue Report.
- Keep all existing Project action authorization, validation, readiness, and dialog behavior unchanged.
- Trigger uses `aria-label="Project actions"`, `aria-haspopup="menu"`, and `aria-expanded`.

---

### Task 1: Compact Project action dropdown

**Files:**
- Modify: `src/client/components/projects/ProjectActions.tsx`
- Modify: `src/client/components/projects/ProjectReport.tsx`
- Modify: `scripts/project-actions.test.tsx`

**Interfaces:**
- Consumes: `ProjectActionsProps.project`, `userRole`, and existing lifecycle callbacks.
- Produces: optional `onChange: () => void` prop and a single accessible dropdown trigger.

- [ ] **Step 1: Write the failing interaction test**

Render `ProjectActions` into JSDOM, assert only `Project actions` is initially visible, click it, then assert `Change Project`, `Generate CR Transport`, and `Cancel Project` are menu items.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx --test scripts/project-actions.test.tsx`

Expected: FAIL because the direct action buttons are still rendered and no `Project actions` trigger exists.

- [ ] **Step 3: Implement the minimal dropdown**

Add `menuOpen` state, render `MoreVertical` inside `detail-icon-action`, and move all existing action buttons into `detail-action-menu-list`. Add the Change action only when `onChange` exists and the Project is not cancelled. Close the menu before invoking an action.

- [ ] **Step 4: Integrate Change Project**

Remove the standalone Change button from `ProjectReportView` and pass `onChange={() => onChange?.(state.detail!.project.id)}` into `ProjectActions`.

- [ ] **Step 5: Verify focused and full regression suites**

Run: `npx tsx --test scripts/project-actions.test.tsx scripts/project-report.test.tsx`

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 6: Build, inspect, and activate**

Run: `npm run build`

Open Project Report in the local browser, verify the dropdown visually, restart the port 3001 backend, and confirm `/` returns HTTP 200.
