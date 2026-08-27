# Issue Reminder Email Design

## Objective

Allow authorized team members to send a manual email reminder from an Issue's **Actions** menu when the Issue remains in progress or its primary CR transport has not reached PRD. The reminder gives the IT requester, assigned ABAPers, and SAP ABAP Group the same current Issue and transport context.

## Scope

This first release supports one Issue at a time, a mandatory review before sending, and an audit trail. It does not add scheduled, bulk, or automatic reminders.

## Authorization

- Add an `is_reminder` boolean to `issue_people`, defaulting to `FALSE`.
- Expose it as a **REMINDER** checklist in **Master Data > People Roles**.
- Only a signed-in user whose linked person has this checklist may view and submit **Send Reminder Email**.
- Administration of the People Roles checklist remains subject to the existing Admin-only Master Data controls.

## Eligibility

The backend recalculates eligibility at preview and send time from the latest persisted Issue and CR lifecycle data.

- An Issue is eligible when its derived process status is `in_progress`, or its primary CR lifecycle is not `in_prd`.
- Cancelled Issues and Issues whose primary CR has reached `in_prd` are ineligible.
- The endpoint returns the current reason when ineligible, so the UI does not rely on stale list-page data.

## Recipients

Create one ordered, de-duplicated recipient list:

1. Active Issue participants with role `requester`, department `IT`, and a valid email address.
2. Active Issue participants with role `abaper` and a valid email address.
3. The active Group Email whose name is `SAP ABAP Group` (currently `sap-abap@trst.co.id`). This address is always included.

Participants without an email are omitted and shown in the preview as skipped recipients. The SAP ABAP Group record is not created by this feature; it must already exist and be active. If it is missing or inactive, sending is blocked with an actionable configuration error.

All recipients are sent as Multiple To. The app joins the de-duplicated email addresses with commas. A controlled MCP send on 2026-08-27 confirmed this format delivers to Multiple To recipients and accepts a CC field.

## MCP Email Integration

The configured MCP server exposes `send_email` with `to`, `cc`, `bcc`, `subject`, and `body` string parameters. The body uses plain text/Markdown.

- Keep MCP protocol and recipient mapping behind a dedicated email-delivery adapter rather than embedding tool arguments in Issue routes or UI code.
- Send the comma-separated recipient list through `to`; this Multiple To format has been verified against the configured MCP server.
- The reminder does not use CC or BCC in this release, but the adapter preserves support for them for a future business requirement.
- At send time, the adapter verifies that the configured MCP server still exposes `send_email`. A missing tool or failed connection blocks sending with a clear error.
- Record the MCP response or failure without logging secrets.

## Reminder Content

The subject is generated as:

`[Reminder CR] {ISSUE_NO} - {PRIMARY_CR} - {CR_STATUS}`

The body contains:

- Issue No. and Issue Description.
- All linked CR Transport numbers, highlighting the primary CR.
- Current lifecycle status for each linked CR and the primary CR status.
- All GLPI ticket numbers with their ticket hyperlinks.
- All CR Helpdesk numbers.
- A mandatory **Notes / Outstanding** section.

The preview supplies an editable Notes draft based on the current outstanding condition, such as not released in DEV, pending QA, pending PRD, missing Issue data, or unavailable lifecycle evidence. The sender must review and submit non-empty Notes before sending.

## User Interface

- Add **Send Reminder Email** to both the Issue Report row Actions menu and Issue Detail Actions menu.
- Use a dialog consistent with the existing Email Template preview pattern.
- The dialog shows eligibility, current transport status, recipient list, skipped recipients, subject, body preview, editable Notes, last reminder information, and the cooldown reason if applicable.
- Show **Send Email** after the sender reviews the preview and provides non-empty Notes.
- Disable actions while preview or send is in progress. Refresh Issue detail/list state after a successful send.

## Cooldown and Audit

- Apply a 24-hour cooldown per Issue after a successful reminder send.
- Persist a dedicated reminder record with Issue ID, sender user/person, recipient list, subject, body snapshot, notes, primary CR/lifecycle snapshot, MCP outcome, and timestamps.
- Record a matching Audit Log event for successful and failed send attempts. Failed attempts do not start the successful-send cooldown.
- Show the last successful reminder in the preview.

## Error Handling

- Block with clear feedback for missing SAP ABAP Group, no valid recipient list, ineligible lifecycle, insufficient REMINDER role, cooldown, or MCP configuration failure.
- If MCP reports a sending failure, retain the dialog contents and report the returned safe error message. Do not create a successful reminder record.
- Do not expose the MCP URL, authorization header, or other secrets in UI, audit output, or API errors.

## Verification

- Unit-test REMINDER authorization, recipient selection and deduplication, requester IT filtering, required SAP ABAP Group behavior, lifecycle eligibility, Notes validation, cooldown, body rendering, and audit persistence.
- Mock `send_email` for success and failure paths.
- Test the Actions menu and reminder dialog states.
- Retain the existing controlled Multiple To test as integration evidence and re-run it if the MCP recipient contract changes.
