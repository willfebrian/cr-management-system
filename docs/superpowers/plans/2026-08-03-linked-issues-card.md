# Linked Issues Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved two-section Linked Issues card with compact fixed-width row actions in Project Create and Change.

**Architecture:** Keep `ProjectIssuePicker` as the shared behavioural component and add only semantic section wrappers/headings. Keep layout and state appearance in `project.css`, using existing global CRMS tokens and responsive breakpoints. No API, database, or Project lifecycle code changes.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, React server rendering, Vite.

## Global Constraints

- Use one parent Linked Issues card with Search Results and Selected Issues sections.
- Use a fixed `112px` action column and `34px` row-action height.
- Do not introduce nested cards or horizontal scrolling.
- Preserve all existing Issue selection, availability, and removal behaviour.
- Save Project remains the only solid teal primary editor action.

---

### Task 1: Linked Issues structure and action sizing

**Files:**
- Modify: `scripts/project-issue-picker.test.tsx`
- Modify: `scripts/visual-consistency-contract.test.mjs`
- Modify: `src/client/components/projects/ProjectIssuePicker.tsx`
- Modify: `src/client/styles/project.css`

**Interfaces:**
- Consumes: existing `ProjectIssuePickerProps`, `IssueSummary`, `onAdd(issue)`, and `onRemove(issueId)`.
- Produces: semantic `.project-issue-results` and `.project-selected-section` groups; `.project-issue-action` fixed-width action wrapper.

- [x] **Step 1: Write failing component and CSS contract tests**

Add component assertions:

```tsx
assert.match(markup, />Search Results</);
assert.match(markup, />Selected Issues</);
assert.match(markup, /class="project-issue-action"/);
```

Add CSS contract assertions:

```js
assert.match(projectStyles, /\.project-issue-action\s*\{[^}]*width:\s*112px/is);
assert.match(projectStyles, /\.project-issue-action\s+\.project-button\s*\{[^}]*min-height:\s*34px/is);
assert.match(projectStyles, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+112px/is);
```

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
cmd.exe /c node_modules\.bin\tsx.cmd --test scripts\project-issue-picker.test.tsx
node scripts/visual-consistency-contract.test.mjs
```

Expected: FAIL because the section headings, action wrapper, and fixed-width layout do not exist.

- [x] **Step 3: Implement semantic section structure**

Update the shared picker to render:

```tsx
<section className="project-issue-results" aria-labelledby="project-search-results-heading">
  <div className="project-subsection-heading">
    <h4 id="project-search-results-heading">Search Results</h4>
    <span>{options.length} Issues</span>
  </div>
  <div className="project-issue-options">...</div>
</section>

<section className="project-selected-section" aria-labelledby="project-selected-issues-heading">
  <div className="project-subsection-heading">
    <h4 id="project-selected-issues-heading">Selected Issues</h4>
    <span>Included in this Project</span>
  </div>
  <div className="project-selected-issues">...</div>
</section>
```

Wrap every Add, Added, and Remove button in `<div className="project-issue-action">` without changing callbacks or disabled conditions.

- [x] **Step 4: Implement the approved visual contract**

Use a two-column row grid and fixed action wrapper:

```css
.project-selected-issue,
.project-issue-option {
  grid-template-columns: minmax(0, 1fr) 112px;
}

.project-issue-action {
  width: 112px;
}

.project-issue-action .project-button {
  min-height: 34px;
  width: 100%;
}
```

Add subtle section dividers, a token-based teal tint for Selected Issues, truncation for descriptions, and a narrow-screen rule that moves the action below the Issue information while keeping it right-aligned at `112px`.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the same focused commands from Step 2.

Expected: PASS with no assertion failures.

- [x] **Step 6: Run regression, build, and browser verification**

Run:

```powershell
cmd.exe /c npm.cmd test
cmd.exe /c npm.cmd run build
git diff --check
```

Inspect authenticated Project Create and Change pages at `http://127.0.0.1:3001/`. Confirm two section headings, consistent `112px x 34px` Add/Added/Remove actions, selected tint, and mobile reflow without horizontal scrolling.
