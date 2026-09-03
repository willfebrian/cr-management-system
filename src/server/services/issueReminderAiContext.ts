type UnknownRecord = Record<string, unknown>;

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function addFact(lines: string[], label: string, value: unknown) {
  const normalized = text(value);
  if (normalized) lines.push(`- ${label}: ${normalized}`);
}

function addSection(lines: string[], title: string, facts: string[]) {
  if (!facts.length) return;
  lines.push("", `${title}:`, ...facts);
}

function personName(person: UnknownRecord) {
  return text(person.full_name || person.person_name_snapshot || person.nickname);
}

function compactRecord(record: UnknownRecord | null | undefined, fields: Array<[string, string]>) {
  const facts: string[] = [];
  for (const [key, label] of fields) addFact(facts, label, record?.[key]);
  return facts;
}

export function buildReminderAiContext(
  detail: UnknownRecord,
  crDetails: UnknownRecord[],
  selectedActions: string[],
  currentNotes: string
) {
  const issue = (detail.issue || {}) as UnknownRecord;
  const lines = ["KNOWN ISSUE FACTS — use only the information listed below."];

  addSection(lines, "Issue", compactRecord(issue, [
    ["issue_key", "Issue No."],
    ["issue_name", "Issue name"],
    ["issue_status", "Issue status"],
    ["problem_analysis", "Problem analysis"],
    ["impact_analysis", "Impact analysis"],
    ["email_subject", "Original email subject"],
    ["email_date_received", "Email received"],
    ["create_issue_date", "Issue created"]
  ]));

  const participants = Array.isArray(detail.participants) ? detail.participants as UnknownRecord[] : [];
  const participantFacts = participants.flatMap((person) => {
    const name = personName(person);
    if (!name) return [];
    const qualifiers = [text(person.department), person.is_primary ? "primary" : ""].filter(Boolean);
    return [`- ${text(person.role) || "participant"}: ${name}${qualifiers.length ? ` (${qualifiers.join(", ")})` : ""}`];
  });
  addSection(lines, "Participants", participantFacts);

  const glpiRows = Array.isArray(detail.glpi) ? detail.glpi as UnknownRecord[] : [];
  addSection(lines, "GLPI tickets", glpiRows.flatMap((ticket) => {
    const number = text(ticket.ticket_number);
    return number ? [`- GLPI #${number}${ticket.is_primary ? " (primary)" : ""}: https://itsm.trst.co.id/front/ticket.form.php?id=${encodeURIComponent(number)}`] : [];
  }));

  const helpdeskRows = Array.isArray(detail.crHelpdeskNumbers) ? detail.crHelpdeskNumbers as UnknownRecord[] : [];
  addSection(lines, "CR Helpdesk", helpdeskRows.flatMap((row) => {
    const number = text(row.cr_helpdesk_no);
    return number ? [`- ${number}${row.is_primary ? " (primary)" : ""}`] : [];
  }));

  const links = Array.isArray(detail.crLinks) ? detail.crLinks as UnknownRecord[] : [];
  const crFacts: string[] = [];
  links.forEach((link, index) => {
    const number = text(link.trkorr);
    if (!number) return;
    crFacts.push(`- CR ${index + 1}: ${number}${link.is_primary ? " (primary)" : ""}`);
    for (const [key, label] of [
      ["sap_system_code", "  SAP system"],
      ["cr_description_snapshot", "  Description"],
      ["status_group", "  SAP status"],
      ["lifecycle_status", "  Lifecycle status"],
      ["sap_created_at", "  Created"],
      ["sap_released_at", "  Released"],
      ["qa_import_date", "  QA import date"],
      ["prd_import_date", "  PRD import date"]
    ] as Array<[string, string]>) addFact(crFacts, label, link[key]);

    const crDetail = crDetails.find((item) => text((item.request as UnknownRecord | undefined)?.trkorr) === number) || crDetails[index];
    const objects = Array.isArray(crDetail?.objects) ? crDetail.objects as UnknownRecord[] : [];
    for (const object of objects) {
      const objectName = text(object.object_name);
      if (!objectName) continue;
      const type = [text(object.pgmid), text(object.object_type)].filter(Boolean).join("/");
      crFacts.push(`-   SAP object${type ? ` ${type}` : ""}: ${objectName}`);
    }
  });
  addSection(lines, "Linked CR transports", crFacts);

  addSection(lines, "DEV timeline", compactRecord(detail.devTimeline as UnknownRecord | null, [
    ["dev_tested_date", "DEV tested"], ["dev_evaluated_date", "DEV evaluated"]
  ]));
  addSection(lines, "QA timeline", compactRecord(detail.qaTimeline as UnknownRecord | null, [
    ["qa_tested_date", "QA tested"], ["qa_evaluated_date", "QA evaluated"]
  ]));
  addSection(lines, "PRD timeline", compactRecord(detail.prdTimeline as UnknownRecord | null, [
    ["prd_requested_date", "PRD requested"], ["prd_evaluated_date", "PRD evaluated"], ["approval_date", "Approved"]
  ]));

  addSection(lines, "Selected follow-up", selectedActions.filter(Boolean).map((action) => `- ${action}`));
  if (currentNotes.trim()) addSection(lines, "Current user-written notes", [`- ${currentNotes.trim()}`]);

  return lines.join("\n").trim();
}

