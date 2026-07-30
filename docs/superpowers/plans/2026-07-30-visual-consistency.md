# Visual Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menerapkan header responsif, hierarki card, report workspace, controlled scrolling, sticky Actions, dan penyelarasan visual lintas halaman tanpa mengubah alur data.

**Architecture:** Pertahankan `App.tsx` dan `styles.css` sebagai pusat UI yang sudah ada, lalu ekstrak hanya helper/component kecil yang memerlukan pengujian mandiri. Gunakan CSS design tokens dan kelas semantik bersama agar CR Transport, Issue Report, Project Report, editor, Dashboard, sidebar, dan User Management memakai aturan visual yang sama.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, CSS, Node test runner, React server rendering.

## Global Constraints

- Jangan mengubah data database atau kontrak API.
- Pertahankan Source Systems, Sync Mode, Lookback/Period, dan Sync CR.
- Jangan mengubah typography/font isi generated ticket, email, atau Form CR.
- Jangan menambah dependency.
- Jangan me-revert perubahan aktif milik user.
- Target visual utama: 1920x1080, 1366x768, 1280x720, serta zoom 125% dan 150%.

---

### Task 1: Visual design tokens and regression contract

**Files:**
- Create: `scripts/visual-consistency-contract.test.mjs`
- Modify: `package.json`
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: existing typography tokens and current CSS class names.
- Produces: shared color, spacing, radius, surface, focus, and sticky-action tokens used by all later tasks.

- [ ] **Step 1: Write the failing visual contract**

Create a Node test that reads `styles.css` and asserts the presence of `--color-primary`, `--color-focus-ring`, `--surface-page`, `--surface-card`, `--space-1` through `--space-6`, `--radius-card`, `--action-bar-height`, a teal `:focus-visible` rule, and preserved template font exceptions.

- [ ] **Step 2: Run the contract and verify RED**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: FAIL because the shared visual tokens do not exist yet.

- [ ] **Step 3: Add the shared tokens and base states**

Add semantic tokens to `:root`, replace repeated primary focus colors in the touched shared rules, and define consistent `:focus-visible`, selected-row, empty, loading, notice, and disabled behavior. Keep template preview font rules unchanged.

- [ ] **Step 4: Add the contract to the test command and verify GREEN**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: PASS with the generated-template font checks still intact.

### Task 2: Responsive page header and sidebar accordion

**Files:**
- Create: `src/client/navigation.ts`
- Create: `scripts/navigation-visual-state.test.ts`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `nextExpandedSidebarGroup(current: "issue" | "project" | null, requested: "issue" | "project"): "issue" | "project" | null`.
- Consumes: shared tokens from Task 1.

- [ ] **Step 1: Write failing tests**

Test that requesting Issue closes Project, requesting Project closes Issue, and requesting the currently open group collapses it. Add CSS/source contract assertions that the header contains `page-identity` and `page-sync-toolbar`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test scripts/navigation-visual-state.test.ts`

Expected: FAIL because the helper and new semantic header classes do not exist.

- [ ] **Step 3: Implement header and accordion behavior**

Replace the two independent sidebar booleans with one expanded-group state. Add `page-identity` around title/description and `page-sync-toolbar` to the sync controls. Update CSS so the title column keeps readable width, the right toolbar wraps internally, and the toolbar stacks below the identity only at the responsive breakpoint.

- [ ] **Step 4: Verify GREEN**

Run: `npx tsx --test scripts/navigation-visual-state.test.ts`

Expected: PASS.

### Task 3: CR Transport data workspace

**Files:**
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `scripts/visual-consistency-contract.test.mjs`

**Interfaces:**
- Consumes: `visual-data-workspace`, shared table, filter, selected, and focus styles.
- Produces: one bounded CR workspace containing filter, scrollable table, and pagination.

- [ ] **Step 1: Extend the failing contract**

Assert that CR Transport renders a `cr-data-workspace`, that filter and table use the same workspace wrapper, that the table header is sticky, and that no CR row card class is introduced.

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: FAIL on the missing CR workspace structure.

- [ ] **Step 3: Implement the workspace**

Wrap CR filters and report layout in one semantic workspace, keep table rows unchanged, align pagination with the same surface, and use responsive column sizing so the default three columns fit the desktop workspace.

- [ ] **Step 4: Verify GREEN**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: PASS.

### Task 4: Issue Report columns and controlled dual-pane layout

**Files:**
- Create: `src/client/components/IssueColumnMenu.tsx`
- Create: `scripts/issue-report-layout.test.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `IssueColumnKey`, `DEFAULT_ISSUE_COLUMNS`, and `IssueColumnMenu`.
- Consumes: Issue filter state, Issue rows, and shared workspace tokens.

- [ ] **Step 1: Write failing component and source-contract tests**

Assert that default columns are `issue`, `name`, `abaper`, `cr`, `status`, and `completeness`; optional columns are `glpi` and `crHelpdesk`; the Columns control renders accessible checkboxes; and the layout contains `controlled-dual-pane`.

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --test scripts/issue-report-layout.test.tsx`

Expected: FAIL because the menu and layout classes do not exist.

- [ ] **Step 3: Implement columns and pane ownership**

Add Columns state/menu, conditionally render optional table columns, place filters above the dual-pane workspace, give list and detail their own vertical overflow, keep the page workspace from adding a third desktop scroll, and retain horizontal overflow as a fallback when optional columns are active.

- [ ] **Step 4: Verify GREEN**

Run: `npx tsx --test scripts/issue-report-layout.test.tsx`

Expected: PASS.

### Task 5: Issue Detail hierarchy

**Files:**
- Create: `src/client/components/SummaryStrip.tsx`
- Create: `scripts/summary-strip.test.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `SummaryStrip({ items })`, where every item has `label`, `value`, and optional `wide`.
- Consumes: selected Issue metadata and existing `IncompleteGroupCards`.

- [ ] **Step 1: Write failing summary-strip test**

Render four metadata items and assert semantic labels/values without nested card markup.

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --test scripts/summary-strip.test.tsx`

Expected: FAIL because `SummaryStrip` does not exist.

- [ ] **Step 3: Implement the hierarchy**

Replace Issue detail metadata tiles with `SummaryStrip`, retain Incomplete items as one actionable section, and convert Analysis, CR Links, Participants, and timelines to divider-based sections rather than nested card surfaces.

- [ ] **Step 4: Verify GREEN**

Run: `npx tsx --test scripts/summary-strip.test.tsx scripts/incomplete-group-cards.test.tsx`

Expected: PASS.

### Task 6: Project Report summary and linked rows

**Files:**
- Modify: `src/client/components/ProjectLinkedIssues.tsx`
- Modify: `scripts/project-linked-issues.test.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: `SummaryStrip` from Task 5.
- Produces: lighter linked-issue rows with visible chevron and existing navigation callback.

- [ ] **Step 1: Extend the failing tests**

Assert that each linked issue remains a button, exposes the existing issue key/name/status/CR information, and renders a chevron affordance. Add a source contract that Project metrics use `SummaryStrip`.

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --test scripts/project-linked-issues.test.tsx`

Expected: FAIL because the chevron and summary strip are not present.

- [ ] **Step 3: Implement the lighter Project hierarchy**

Replace the four metric cards with `SummaryStrip`, retain compact project rows, and restyle linked issues as divider rows with hover/focus/chevron while preserving navigation.

- [ ] **Step 4: Verify GREEN**

Run: `npx tsx --test scripts/project-linked-issues.test.tsx scripts/summary-strip.test.tsx`

Expected: PASS.

### Task 7: Editor hierarchy and sticky Actions safe space

**Files:**
- Create: `scripts/editor-layout-contract.test.mjs`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: shared card hierarchy and action-bar tokens.
- Produces: always-visible editor Actions constrained to the editor with bottom safe space.

- [ ] **Step 1: Write the failing editor contract**

Assert that the editor has `editor-safe-space`, the action bar uses `position: sticky` and `bottom: 0`, the editor bottom padding references `--action-bar-height`, and Issue Initiation remains an expandable primary section.

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/editor-layout-contract.test.mjs`

Expected: FAIL because the explicit safe-space contract is missing.

- [ ] **Step 3: Implement sticky containment and hierarchy**

Place the sticky bar inside the editor boundary, reserve safe space below the final section, make selection/issue summary strips lighter than active editor sections, and render collapsed lifecycle sections as compact divider rows without altering form behavior.

- [ ] **Step 4: Verify GREEN**

Run: `node scripts/editor-layout-contract.test.mjs && npx tsx --test scripts/issue-incomplete-navigation.test.ts scripts/incomplete-group-cards.test.tsx`

Expected: PASS.

### Task 8: Dashboard, User Management, and responsive polish

**Files:**
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `scripts/visual-consistency-contract.test.mjs`

**Interfaces:**
- Consumes: shared surfaces, focus states, spacing, and responsive header behavior.
- Produces: balanced dashboard metric grid and simplified administrative workspaces.

- [ ] **Step 1: Extend the contract and verify RED**

Assert that Dashboard uses an auto-fitting metric grid, User Management uses explicit form/table workspace classes, and responsive rules exist for 1366-width header/panes and narrow single-column layouts.

- [ ] **Step 2: Implement the polish**

Use an auto-fit metric grid without an empty dominant slot, remove unnecessary nested card emphasis from User Management, standardize empty/loading/error states, and add responsive rules for header, filters, summary strips, panes, sidebar, and sticky Actions.

- [ ] **Step 3: Verify GREEN**

Run: `node scripts/visual-consistency-contract.test.mjs`

Expected: PASS.

### Task 9: Full automated and visual verification

**Files:**
- Modify only if verification exposes a regression in files already listed above.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: fresh evidence for functionality, build integrity, and visual acceptance.

- [ ] **Step 1: Run full automated verification**

Run: `npm test`

Expected: all contract, navigation, typography, incomplete-item, linked-issue, and layout tests pass.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 3: Perform browser verification**

Check Dashboard, CR Transport, Issue Report, Change Issue, Project Report, Create/Change Project, and User Management at 1920x1080, 1366x768, and a narrow viewport. Confirm no header clipping, no unwanted third report scrollbar, optional Issue columns remain reachable, linked rows navigate, sticky Actions remain visible without covering fields, and generated preview fonts are unchanged.

- [ ] **Step 4: Review the final diff**

Run: `git diff -- src/client src/client/components scripts package.json docs/superpowers`

Expected: only visual enhancement, supporting tests, and documentation changes are present; no database or API behavior changes.

### Task 10: Cross-report hierarchy alignment

**Files:**
- Create: `src/client/components/DisplayNameList.tsx`
- Create: `scripts/cross-report-alignment.test.tsx`
- Modify: `src/client/components/SummaryStrip.tsx`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `scripts/visual-consistency-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `splitDisplayNames(value: string): string[]` and `DisplayNameList({ value })`.
- Consumes: `SummaryStrip`, `IncompleteGroupCards`, CR detail data, and shared visual tokens.

- [ ] **Step 1: Write failing component and source-contract tests**

Test that comma/semicolon-separated names become individual lines, one name remains one line, and empty values render `-`. Assert that CR detail uses `SummaryStrip`, Related Issues expose a chevron, and the CSS contract contains top-aligned summary items, calm incomplete surfaces, consistent selected-row indicators, and divider-based detail sections.

- [ ] **Step 2: Run tests and verify RED**

Run: `cmd.exe /c node_modules\.bin\tsx.cmd --test scripts\cross-report-alignment.test.tsx && node scripts\visual-consistency-contract.test.mjs`

Expected: FAIL because `DisplayNameList`, the CR summary strip, chevron, and new cross-report CSS contracts do not exist.

- [ ] **Step 3: Implement top-aligned metadata**

Create `DisplayNameList`, use it for Requester and ABAPer values in Issue Detail, and set summary strip items to `align-content: start` with `grid-auto-rows: max-content`.

- [ ] **Step 4: Implement CR detail hierarchy**

Replace the CR metadata tile grid with `SummaryStrip`, render Related Issues as divider rows with a right chevron, and apply shared detail-section heading/divider spacing to Related Issues, Lifecycle, Tasks, and Objects.

- [ ] **Step 5: Calm incomplete cards and unify row states**

Use neutral card surfaces and borders for incomplete groups and chips, retain amber only for warning headings/counts, and give CR/Issue table rows plus Project rows the same selected surface and left indicator.

- [ ] **Step 6: Verify GREEN**

Run: `cmd.exe /c node_modules\.bin\tsx.cmd --test scripts\cross-report-alignment.test.tsx scripts\summary-strip.test.tsx scripts\incomplete-group-cards.test.tsx scripts\project-linked-issues.test.tsx && node scripts\visual-consistency-contract.test.mjs`

Expected: PASS.

- [ ] **Step 7: Run final automated and browser verification**

Run: `cmd.exe /c npm test` and `cmd.exe /c npm run build`.

In the browser, verify CR detail, Issue detail with one/three/five names, incomplete groups, Project Report, selected rows, desktop layout, and the 900px responsive breakpoint. Confirm no horizontal page overflow and no console errors.
