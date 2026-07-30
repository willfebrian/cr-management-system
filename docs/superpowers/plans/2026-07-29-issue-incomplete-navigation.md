# Issue Incomplete Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Issue Initiation collapsible and replace the flat incomplete-data list with grouped, clickable cards that navigate to exact missing fields.

**Architecture:** A focused `issueIncomplete.ts` module will convert `IssueDetail` into typed missing-field descriptors and groups. `IssueChange` will render those groups and send a stable target request to `IssueEditor`; the editor will expand the owning section, render the field, then scroll, focus, and temporarily highlight its target element.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Node test runner through `tsx`

## Global Constraints

- Preserve all lifecycle enable/disable rules.
- Keep Issue Initiation expanded when an issue is first opened.
- Render only incomplete groups that contain at least one item.
- Every incomplete item must navigate independently to its exact target.
- Disabled fields may be scrolled to and highlighted but must remain disabled.
- Do not add a UI-testing dependency.

---

### Task 1: Structured Incomplete Data

**Files:**
- Create: `src/client/issueIncomplete.ts`
- Create: `scripts/issue-incomplete-navigation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `IssueDetail` from `src/shared/types.ts`
- Produces:
  - `IssueSection = "initiation" | "dev" | "qa" | "prd"`
  - `IncompleteItem = { id: string; label: string; section: IssueSection; targetId: string }`
  - `IncompleteGroup = { section: IssueSection; title: string; items: IncompleteItem[] }`
  - `getIncompleteItems(detail: IssueDetail): IncompleteItem[]`
  - `groupIncompleteItems(items: IncompleteItem[]): IncompleteGroup[]`
  - `expandSection(current: Record<IssueSection, boolean>, section: IssueSection): Record<IssueSection, boolean>`

- [ ] **Step 1: Write the failing unit tests**

Create fixtures with an empty active issue and assert literal results:

```ts
test("groups DEV participant and timeline gaps under DEV Processing", () => {
  const groups = groupIncompleteItems(getIncompleteItems(emptyIssueDetail));
  const dev = groups.find((group) => group.section === "dev");
  assert.deepEqual(dev?.items.map((item) => item.label), [
    "DEV Tester",
    "DEV Evaluator",
    "Testing Date",
    "Evaluation Date"
  ]);
});

test("omits complete groups", () => {
  const groups = groupIncompleteItems(getIncompleteItems(detailWithCompleteDev));
  assert.equal(groups.some((group) => group.section === "dev"), false);
});

test("expands only the requested collapsed section", () => {
  assert.deepEqual(
    expandSection({ initiation: true, dev: false, qa: false, prd: false }, "qa"),
    { initiation: true, dev: false, qa: true, prd: false }
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx tsx --test scripts/issue-incomplete-navigation.test.ts
```

Expected: FAIL because `src/client/issueIncomplete.ts` does not exist.

- [ ] **Step 3: Implement the typed descriptor catalog**

Implement a literal catalog that maps issue headers, participant roles, and timeline keys to stable section and target IDs. `getIncompleteItems` checks the same completeness conditions as the current `missingIssueData`, while `groupIncompleteItems` preserves the section order `initiation`, `dev`, `qa`, `prd`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
npx tsx --test scripts/issue-incomplete-navigation.test.ts
```

Expected: all structured-data tests PASS.

- [ ] **Step 5: Add the unit suite to `npm test`**

Update the script to:

```json
"test": "node scripts/regression-navigation-and-cr-sort.test.mjs && tsx --test scripts/issue-incomplete-navigation.test.ts"
```

Run `npm test`; expected: all existing and new tests PASS.

### Task 2: Collapsible Issue Initiation and Navigation Wiring

**Files:**
- Modify: `src/client/pages/App.tsx`
- Modify: `scripts/issue-incomplete-navigation.test.ts`

**Interfaces:**
- Consumes: `IncompleteItem`, `IssueSection`, `getIncompleteItems`, `groupIncompleteItems`, and `expandSection`
- Produces:
  - `IncompleteNavigationRequest = { sequence: number; item: IncompleteItem }`
  - `IssueEditor` prop `navigationRequest?: IncompleteNavigationRequest | null`

- [ ] **Step 1: Add failing behavior tests for target IDs**

Extend the unit test with literal assertions that representative entries point to their exact fields:

```ts
test("maps incomplete entries to stable field targets", () => {
  const items = getIncompleteItems(emptyIssueDetail);
  assert.equal(items.find((item) => item.label === "Requester")?.targetId, "issue-requesters");
  assert.equal(items.find((item) => item.label === "DEV Evaluator")?.targetId, "issue-dev-evaluator");
  assert.equal(items.find((item) => item.label === "Approval Date")?.targetId, "issue-approval-date");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx tsx --test scripts/issue-incomplete-navigation.test.ts
```

Expected: FAIL until the exact target IDs are added to the catalog.

- [ ] **Step 3: Implement navigation request flow**

In `IssueChange`:

- Replace `missingIssueData(changeDetail)` with `getIncompleteItems(changeDetail)`.
- Group items through `groupIncompleteItems`.
- Render each group as a card and each item as a native button.
- Increment a request sequence when an item is clicked so repeated clicks on the same item still trigger navigation.
- Pass the request into `IssueEditor`.

In `IssueEditor`:

- Change expanded state to `{ initiation, dev, qa, prd }`.
- Render Issue Initiation with the shared `phase-title phase-toggle` button.
- When a request arrives, expand its section through `expandSection`.
- After React renders, locate `[data-incomplete-target="<targetId>"]`, call `scrollIntoView({ behavior: "smooth", block: "center" })`, focus its input/select/textarea/button when enabled, and add a temporary highlight class.
- Remove the highlight timer on request changes and component unmount.

- [ ] **Step 4: Add stable targets to fields**

Wrap or mark every completeness-controlled field with `data-incomplete-target`, including Issue Name, Created On, GLPI, CR, Requester, ABAPer, all DEV/QA/PRD people inputs, and their editable timeline inputs. Do not add a target for read-only transport timestamps because they are not included in the incomplete catalog.

- [ ] **Step 5: Run unit tests and TypeScript build**

Run:

```powershell
npm test
npm run build
```

Expected: all tests PASS and TypeScript/Vite build succeeds.

### Task 3: Grouped Card and Focus Styling

**Files:**
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes CSS classes emitted by `IssueChange` and the highlight class emitted by `IssueEditor`
- Produces responsive grouped-card layout and visible temporary target highlight

- [ ] **Step 1: Add grouped summary styling**

Implement:

- A responsive grid for incomplete group cards.
- Warm warning colors consistent with the current incomplete count.
- Group heading, item count, and compact item buttons.
- Clear hover and keyboard focus-visible states.

- [ ] **Step 2: Add destination highlight styling**

Apply a short outline/background animation to the target wrapper without changing the input's disabled state or layout dimensions.

- [ ] **Step 3: Run verification**

Run:

```powershell
npm test
npm run build
```

Expected: all tests PASS and build succeeds without warnings caused by this change.

### Task 4: Browser Verification

**Files:**
- No production files unless a browser-observed defect requires a new RED/GREEN cycle.

**Interfaces:**
- Consumes the running local application at `http://127.0.0.1:3001`
- Produces verified user-facing behavior

- [ ] **Step 1: Restart the updated application if required**

Use the existing project start workflow and retain the authenticated browser session.

- [ ] **Step 2: Verify Issue Initiation toggle**

Open Change Issue, select an issue, click `Hide` and `Show`, and confirm the content collapses and restores without losing field values.

- [ ] **Step 3: Verify grouped incomplete cards**

Confirm the total equals the sum of card counts and DEV Tester plus DEV Evaluator appear inside one DEV Processing card.

- [ ] **Step 4: Verify navigation**

Click representative items from Issue Initiation, DEV, QA, and PRD. Confirm the appropriate card expands, the correct field scrolls into view, enabled fields receive focus, and every target gets a visible temporary highlight.

- [ ] **Step 5: Verify disabled lifecycle behavior**

Click an incomplete item in a not-yet-ready phase and confirm it is located and highlighted while remaining disabled.

- [ ] **Step 6: Run final verification**

Run:

```powershell
git diff --check
npm test
npm run build
```

Expected: no whitespace errors, all tests PASS, and production build succeeds.
