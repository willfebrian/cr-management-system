# Dashboard Issue Mutation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Dashboard Issue metrics immediately after Issue mutations and whenever the Dashboard view is entered.

**Architecture:** Retain PostgreSQL-backed `/api/dashboard` as the source of truth. Invalidate the React Dashboard snapshot at mutation boundaries and perform an immediate fetch when the Dashboard view becomes active, while retaining periodic polling.

**Tech Stack:** React 19, TypeScript, Node source-contract tests, Vite.

## Global Constraints

- Do not change API or database contracts.
- Preserve the existing Issue mutation flow and 60-second Dashboard polling.
- Preserve unrelated user changes.

---

### Task 1: Dashboard refresh regression

**Files:**
- Modify: `scripts/regression-navigation-and-cr-sort.test.mjs`
- Modify: `src/client/pages/App.tsx`

**Interfaces:**
- Consumes: existing `loadDashboardData()` and Issue mutation callbacks.
- Produces: immediate Dashboard refresh on view entry and after successful Issue save, cancel, or delete.

- [ ] **Step 1: Add failing source-contract assertions**

Assert that the Dashboard view effect calls `loadDashboardData()` before installing its interval, and that all three Issue mutation handlers call it after the mutation succeeds.

- [ ] **Step 2: Run the focused regression test and verify RED**

Run: `node scripts/regression-navigation-and-cr-sort.test.mjs`

Expected: FAIL because neither Dashboard entry nor Issue mutation callbacks currently perform the required refresh.

- [ ] **Step 3: Implement the minimal refresh calls**

Call `loadDashboardData()` immediately in the Dashboard effect. After successful save, cancel, and delete, refresh Dashboard and Issue-list data together.

- [ ] **Step 4: Verify GREEN and build**

Run:

```powershell
node scripts/regression-navigation-and-cr-sort.test.mjs
cmd.exe /c npm.cmd run build
```

Expected: regression contract passes and production build exits with code 0.

