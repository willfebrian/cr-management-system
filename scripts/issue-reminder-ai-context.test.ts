import assert from "node:assert/strict";
import test from "node:test";

import { buildReminderAiContext } from "../src/server/services/issueReminderAiContext.js";

test("AI reminder context contains known Issue, participant, ticket, lifecycle, timeline, and SAP object facts", () => {
  const context = buildReminderAiContext({
    issue: {
      issue_key: "26016-01",
      issue_name: "Update report output",
      issue_status: "in_progress",
      problem_analysis: "The required output column is missing.",
      impact_analysis: "Users need manual reconciliation."
    },
    glpi: [{ ticket_number: "14618", is_primary: true }],
    crHelpdeskNumbers: [{ cr_helpdesk_no: "CRH-991", is_primary: true }],
    participants: [
      { role: "requester", full_name: "Siti Aisyah", department: "IT", is_primary: true },
      { role: "abaper", full_name: "William Febrian Piktono", department: "IT", is_primary: true }
    ],
    crLinks: [{
      sap_system_code: "DEV",
      trkorr: "TRDK924353",
      is_primary: true,
      cr_description_snapshot: "Add output column",
      status_group: "released",
      lifecycle_status: "pending_prd",
      qa_import_date: "2026-08-20",
      prd_import_date: null
    }],
    devTimeline: { dev_tested_date: "2026-08-17" },
    qaTimeline: { qa_tested_date: "2026-08-21" },
    prdTimeline: { prd_requested_date: "2026-08-22" }
  }, [{
    request: { trkorr: "TRDK924353", description: "Add output column", status_group: "released" },
    objects: [
      { pgmid: "R3TR", object_type: "PROG", object_name: "ZREPORT_OUTPUT" },
      { pgmid: "LIMU", object_type: "REPS", object_name: "ZREPORT_OUTPUT" }
    ]
  }], ["CR has not reached PRD"], "");

  assert.match(context, /26016-01/);
  assert.match(context, /The required output column is missing/);
  assert.match(context, /Users need manual reconciliation/);
  assert.match(context, /Siti Aisyah/);
  assert.match(context, /GLPI #14618/);
  assert.match(context, /CRH-991/);
  assert.match(context, /TRDK924353/);
  assert.match(context, /pending_prd/);
  assert.match(context, /2026-08-20/);
  assert.match(context, /ZREPORT_OUTPUT/);
  assert.match(context, /CR has not reached PRD/);
});

test("AI reminder context omits unknown values instead of inventing placeholders", () => {
  const context = buildReminderAiContext({
    issue: { issue_key: "26099-01", issue_name: "Minimal Issue" },
    glpi: [],
    crHelpdeskNumbers: [],
    participants: [],
    crLinks: [],
    devTimeline: null,
    qaTimeline: null,
    prdTimeline: null
  }, [], [], "");

  assert.doesNotMatch(context, /undefined|null|unknown owner|estimated/i);
});

