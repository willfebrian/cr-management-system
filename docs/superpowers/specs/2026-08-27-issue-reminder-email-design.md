# Issue Reminder Email Design

## Objective

Allow authorized team members to prepare a manual email reminder from an Issue's **Actions** menu when the Issue remains in progress or its primary CR transport has not reached PRD. The reminder can always be reviewed and copied for manual sending. Direct MCP sending is exposed only when the configured provider reports a compatible, administratively enabled capability.

## Scope

This first release supports one Issue at a time, a mandatory review, copyable reminder content, optional capability-gated MCP sending, and an audit trail. It does not add scheduled, bulk, or automatic reminders.

## Authorization

- Add an `is_reminder` boolean to `issue_people`, defaulting to `FALSE`.
- Expose it as a **REMINDER** checklist in **Master Data > People Roles**.
- Only a signed-in user whose linked person has this checklist may open **Prepare Reminder Email**, copy its content, or submit a direct send when that capability is enabled.
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

Participants without an email are omitted and shown in the preview as skipped recipients. The SAP ABAP Group record is not created by this feature; it must already exist and be active. If it is missing or inactive, reminder preparation and sending are blocked with an actionable configuration error.

The business model is provider-independent: SAP ABAP Group is always the primary To recipient, while eligible requester and ABAPer addresses are additional recipients. The preview shows this logical recipient model even when direct sending is unavailable.

## Delivery Modes

### Prepare and Copy

- Preparation does not depend on MCP availability.
- The user can copy the To/additional-recipient list, subject, and Markdown body from the preview.
- Preparing or copying a reminder does not create a successful-send record and does not start the cooldown.

### Capability-Driven MCP Adapter

- Keep MCP protocol and recipient mapping behind a dedicated email-delivery adapter rather than embedding tool arguments in Issue routes or UI code.
- On connection/test, inspect `tools/list` and normalize the current `send_email` schema into application capabilities such as `sendAvailable`, `supportsCc`, `supportsBcc`, and the documented recipient format.
- Never infer undocumented formats. A string field described as one address is not treated as Multiple To unless the provider contract explicitly documents that behavior.
- Enable direct sending only when both conditions are true:
  1. the current MCP schema can represent SAP ABAP Group as To and all additional recipients without losing recipients; and
  2. an Admin has enabled reminder sending after a controlled provider test.
- Store that Admin-controlled state as an application setting that defaults to disabled; an MCP schema change automatically makes the effective send capability unavailable until the current contract is compatible again.
- For a compatible `to` plus comma-separated `cc` contract, map SAP ABAP Group to `to` and requester/ABAPer addresses to `cc`.
- If a future provider exposes arrays or another documented format, add that mapping inside the adapter without changing reminder-domain or UI contracts.
- When capabilities are missing, changed, or incompatible, keep Prepare/Copy available and disable only **Send Email**, with the reason shown in the dialog.
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

- Add **Prepare Reminder Email** to both the Issue Report row Actions menu and Issue Detail Actions menu.
- Use a dialog consistent with the existing Email Template preview pattern.
- The dialog shows eligibility, current transport status, recipient list, skipped recipients, subject, body preview, editable Notes, MCP availability, last reminder information, and the cooldown reason if applicable.
- Provide copy actions regardless of MCP status. Show **Send Email** only when the delivery adapter reports a compatible capability and sending is administratively enabled.
- Disable actions while preview or send is in progress. Refresh Issue detail/list state after a successful send.

## Cooldown and Audit

- Apply a 24-hour cooldown per Issue after a successful reminder send.
- Persist a dedicated reminder record with Issue ID, sender user/person, recipient list, subject, body snapshot, notes, primary CR/lifecycle snapshot, MCP outcome, and timestamps.
- Record a matching Audit Log event for successful and failed send attempts. Failed attempts do not start the successful-send cooldown.
- Show the last successful reminder in the preview.

## Error Handling

- Block preparation with clear feedback for missing SAP ABAP Group, no valid recipient list, ineligible lifecycle, or insufficient REMINDER role.
- An MCP configuration or capability failure disables direct sending but does not disable Prepare/Copy.
- If MCP reports a sending failure, retain the dialog contents and report the returned safe error message. Do not create a successful reminder record.
- Do not expose the MCP URL, authorization header, or other secrets in UI, audit output, or API errors.

## Verification

- Unit-test REMINDER authorization, recipient selection and deduplication, requester IT filtering, required SAP ABAP Group behavior, lifecycle eligibility, Notes validation, cooldown, body rendering, and audit persistence.
- Unit-test capability normalization and provider mappings for compatible, missing, and changed MCP schemas.
- Mock `send_email` for success and failure paths without making MCP mandatory for preview tests.
- Test the Actions menu, Prepare/Copy behavior, and enabled/disabled direct-send states.
- Perform one explicitly authorized controlled send to test mailboxes before an Admin enables production sending.
