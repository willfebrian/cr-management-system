# Issue Reminder Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-controlled, audited Reminder Email action that sends the current Issue and CR outstanding context through MCP Email.

**Architecture:** Put recipient resolution, eligibility, body rendering, cooldown checks, and persistence in a focused server-side reminder service. Extend the existing MCP client with a typed send operation. Expose preview and send routes from the existing Issue router, then add the REMINDER role and an Email Template-style dialog to the existing Issue report UI.

**Tech Stack:** TypeScript, Express, PostgreSQL, React, Vite, Node test runner, TSX, MCP JSON-RPC.

**Spec:** `docs/superpowers/specs/2026-08-27-issue-reminder-email-design.md`

## Global Constraints

- All new UI text and code comments are English.
- Only a linked active person with `is_reminder = TRUE` can preview or send a reminder.
- To contains valid IT Requester and ABAPer emails; SAP ABAP Group is CC, or sole To when personal recipients are absent.
- Preview and send must recalculate lifecycle from persisted data; cancelled or In PRD Issues cannot send.
- Notes are non-empty, direct send is single-Issue only, and successful sends start a 24-hour cooldown.
- Use the configured MCP `send_email` tool with `to`, optional `cc`, `subject`, and Markdown/plain-text `body`.
- Do not emit MCP URLs, authorization headers, or secrets in API/UI/audit output.

---

### Task 1: Persist the REMINDER role and reminder history

**Files:**
- Modify: `database/schema.sql`
- Create: `database/migrations/20260827_issue_reminder_email.sql`
- Modify: `src/server/routes/adminRoutes.ts`
- Modify: `src/server/auth/authService.ts`
- Modify: `src/server/routes/authRoutes.ts`
- Modify: `src/client/api.ts`
- Modify: `src/client/pages/MasterDataWorkspace.tsx`
- Test: `scripts/issue-reminder-schema.test.ts`
- Test: `scripts/issue-reminder-people-role.test.tsx`

**Interfaces:**
- Produces `issue_people.is_reminder BOOLEAN NOT NULL DEFAULT FALSE`.
- Produces `issue_reminder_emails` with Issue/user/person references, recipient snapshots, subject/body/notes, lifecycle snapshot, MCP outcome, and `sent_at`.
- Extends `AdminPersonRow`, the `/api/admin/people` payload, and the authenticated client user payload with `is_reminder` / `isReminder`.

- [ ] **Step 1: Write failing schema and People Roles tests**

```ts
assert.match(schema, /is_reminder BOOLEAN NOT NULL DEFAULT FALSE/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS issue_reminder_emails/);
assert.match(html, /REMINDER/);
assert.equal(authenticatedUser.isReminder, true);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `tsx --test scripts/issue-reminder-schema.test.ts scripts/issue-reminder-people-role.test.tsx`

Expected: FAIL because the schema, type, and checkbox do not exist.

- [ ] **Step 3: Add schema, migration, API field, and checkbox**

```sql
ALTER TABLE issue_people ADD COLUMN IF NOT EXISTS is_reminder BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS issue_reminder_emails (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  sender_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  sender_person_id BIGINT REFERENCES issue_people(id) ON DELETE SET NULL,
  to_recipients TEXT NOT NULL,
  cc_recipients TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  notes TEXT NOT NULL,
  primary_cr TEXT,
  primary_cr_status TEXT,
  mcp_message_id TEXT,
  mcp_status TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Pass `is_reminder` through the existing People Roles select, create/update payloads, sorting/badge output, and an English **REMINDER** checkbox. Join `app_users.person_id` to `issue_people` in the authenticated-user lookup and expose the resulting boolean as `isReminder`, so the client can hide Reminder actions for users without the checklist.

- [ ] **Step 4: Run tests to verify pass**

Run: `tsx --test scripts/issue-reminder-schema.test.ts scripts/issue-reminder-people-role.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add database src/server/routes/adminRoutes.ts src/server/auth/authService.ts src/server/routes/authRoutes.ts src/client/api.ts src/client/pages/MasterDataWorkspace.tsx scripts/issue-reminder-schema.test.ts scripts/issue-reminder-people-role.test.tsx
git commit -m "feat: add reminder role and history schema"
```

### Task 2: Extend MCP Email with typed send support

**Files:**
- Modify: `src/server/services/mcpEmailService.ts`
- Modify: `src/server/services/outlookService.ts`
- Test: `scripts/mcp-email-service.test.ts`
- Test: `scripts/outlook-mcp-integration.test.ts`

**Interfaces:**
- Produces `sendMcpEmail(config, { to, cc?, bcc?, subject, body }, options)`.
- Produces `sendConfiguredMcpEmail(input)` for the application service layer.
- `sendMcpEmail` returns `{ messageId?: string; status: string; to: string; cc?: string; subject: string }`.

- [ ] **Step 1: Write failing MCP send tests**

```ts
const result = await sendMcpEmail(config, {
  to: "requester@example.test,abaper@example.test",
  cc: "sap-abap@example.test",
  subject: "Test",
  body: "Hello World"
}, { fetchImpl: fakeFetch });

assert.deepEqual(toolCalls, [{
  name: "send_email",
  arguments: {
    to: "requester@example.test,abaper@example.test",
    cc: "sap-abap@example.test",
    subject: "Test",
    body: "Hello World"
  }
}]);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `tsx --test scripts/mcp-email-service.test.ts scripts/outlook-mcp-integration.test.ts`

Expected: FAIL because send functions are not exported.

- [ ] **Step 3: Implement the send adapter**

Use the existing MCP initialize/session/tools-call flow. Require `send_email` in the send path, omit empty CC/BCC arguments, parse structured/text content using the existing `toolPayload`, and normalize only safe response fields.

```ts
const response = await client.request("tools/call", {
  name: "send_email",
  arguments: { to: input.to, ...(input.cc ? { cc: input.cc } : {}), subject: input.subject, body: input.body }
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `tsx --test scripts/mcp-email-service.test.ts scripts/outlook-mcp-integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/mcpEmailService.ts src/server/services/outlookService.ts scripts/mcp-email-service.test.ts scripts/outlook-mcp-integration.test.ts
git commit -m "feat: add MCP email send support"
```

### Task 3: Build the reminder domain service and routes

**Files:**
- Create: `src/server/services/issueReminderService.ts`
- Modify: `src/server/routes/crRoutes.ts`
- Modify: `src/server/db/auditRepository.ts`
- Test: `scripts/issue-reminder-service.test.ts`
- Test: `scripts/issue-reminder-routes.test.ts`

**Interfaces:**
- `previewIssueReminder(issueId, actor)` returns `{ eligible, reason?, to, cc, skippedRecipients, subject, body, notesDraft, lastSentAt? }`.
- `sendIssueReminder(issueId, { notes }, actor)` returns the same preview data plus `{ messageId?, sentAt }`.
- Routes: `GET /api/issues/:id/reminder-preview` and `POST /api/issues/:id/reminder`.

- [ ] **Step 1: Write failing domain tests**

```ts
assert.deepEqual(preview.to, ["requester@example.test", "abaper@example.test"]);
assert.equal(preview.cc, "sap-abap@example.test");
assert.match(preview.body, /GLPI #123/);
await assert.rejects(() => sendIssueReminder(1, { notes: "" }, actor), /Notes/i);
await assert.rejects(() => sendIssueReminder(1, { notes: "Waiting for PRD" }, actor), /24-hour/i);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `tsx --test scripts/issue-reminder-service.test.ts scripts/issue-reminder-routes.test.ts`

Expected: FAIL because the service and routes do not exist.

- [ ] **Step 3: Implement eligibility, recipient resolution, rendering, cooldown, persistence, and audit**

Use `getIssueDetail` lifecycle fields as the authoritative persisted data. Resolve the logged-in user to their linked person and require `is_reminder`. Query participant emails by role, filter IT requesters, deduplicate emails case-insensitively, load active `SAP ABAP Group`, and use it as sole To when personal To is empty.

Render all CR links, GLPI hyperlinks using the existing GLPI URL pattern, CR Helpdesk numbers, current statuses, and an editable outstanding draft. Persist only after MCP reports success; record both successful and failed attempts in `activity_logs` with recipient counts and safe MCP status.

- [ ] **Step 4: Run tests to verify pass**

Run: `tsx --test scripts/issue-reminder-service.test.ts scripts/issue-reminder-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/issueReminderService.ts src/server/routes/crRoutes.ts src/server/db/auditRepository.ts scripts/issue-reminder-service.test.ts scripts/issue-reminder-routes.test.ts
git commit -m "feat: add issue reminder preview and send routes"
```

### Task 4: Add client API and reminder preview dialog

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/pages/App.tsx`
- Modify: `src/client/styles.css`
- Test: `scripts/issue-reminder-client.test.ts`
- Test: `scripts/issue-reminder-ui.test.tsx`

**Interfaces:**
- `fetchIssueReminderPreview(id)` and `sendIssueReminder(id, notes)` call the new Issue endpoints.
- `IssueReminderPreview` exposes `to`, `cc`, `skippedRecipients`, `subject`, `body`, `notesDraft`, `lastSentAt`, and `eligible`.

- [ ] **Step 1: Write failing API/UI tests**

```tsx
assert.match(html, /Send Reminder Email/);
assert.match(html, /Notes \/ Outstanding/);
assert.match(html, /SAP ABAP Group/);
assert.match(html, /Send Email/);
```

```ts
await fetchIssueReminderPreview(42);
assert.deepEqual(urls, ["/api/issues/42/reminder-preview"]);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `tsx --test scripts/issue-reminder-client.test.ts scripts/issue-reminder-ui.test.tsx`

Expected: FAIL because the API methods and dialog do not exist.

- [ ] **Step 3: Implement API, Actions entries, and dialog**

Add the action to both report-row and detail Actions menus only when the current user is marked REMINDER. Fetch preview when opening the dialog, initialize editable Notes from `notesDraft`, show To, CC, skipped recipients, subject, lifecycle, body preview, last sent timestamp, and disable Send until non-empty Notes, eligibility, and cooldown permit it. On success, show a toast and refresh Issue list/detail; on failure retain the entered Notes and preview.

- [ ] **Step 4: Run tests to verify pass**

Run: `tsx --test scripts/issue-reminder-client.test.ts scripts/issue-reminder-ui.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/api.ts src/client/pages/App.tsx src/client/styles.css scripts/issue-reminder-client.test.ts scripts/issue-reminder-ui.test.tsx
git commit -m "feat: add issue reminder email dialog"
```

### Task 5: Run regression verification and document the MCP evidence

**Files:**
- Modify: `README.md`
- Create: `scripts/issue-reminder-documentation.test.mjs`
- Test: `package.json` existing `test:baseline`

**Interfaces:**
- Documents that the MCP Email integration requires `send_email` and that Multiple To/CC are used by Issue Reminder.

- [ ] **Step 1: Write a failing documentation contract assertion**

```ts
assert.match(readFileSync("README.md", "utf8"), /send_email/);
assert.match(readFileSync("README.md", "utf8"), /Multiple To/);
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test scripts/issue-reminder-documentation.test.mjs`

Expected: FAIL because the README does not describe reminder delivery.

- [ ] **Step 3: Document the capability and add the assertion**

Describe the Reminder Email sender prerequisites, `send_email` MCP requirement, recipient routing, and no-secret logging policy in README. Add the documentation contract test.

- [ ] **Step 4: Run focused and baseline tests**

Run: `tsx --test scripts/issue-reminder-schema.test.ts scripts/issue-reminder-people-role.test.tsx scripts/issue-reminder-service.test.ts scripts/issue-reminder-routes.test.ts scripts/issue-reminder-client.test.ts scripts/issue-reminder-ui.test.tsx && node --test scripts/issue-reminder-documentation.test.mjs && npm run test:baseline`

Expected: all focused tests and the existing baseline suite pass.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/issue-reminder-documentation.test.mjs
git commit -m "docs: document issue reminder email delivery"
```
