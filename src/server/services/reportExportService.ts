import { getCrDetailForSystem, listCrRequests } from "../db/crRepository.js";
import { getIssueDetail, listIssues } from "../db/issueRepository.js";
import { buildXlsx, type WorkbookSheet } from "./xlsxWorkbook.js";

type Filters = Record<string, string | number | undefined>;
type Row = Array<string | number | boolean | null | undefined>;

async function allRows(list: (filters: any) => Promise<any>, filters: Filters): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 1; ; page += 1) {
    const result = await list({ ...filters, page, pageSize: 100 });
    rows.push(...result.rows);
    if (page >= result.totalPages) return rows;
  }
}

function sheet(name: string, headers: string[]): WorkbookSheet {
  return { name, rows: [headers] };
}

function date(value: unknown): string {
  return value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
}

export async function exportCrReport(filters: Filters): Promise<Buffer> {
  const summary = sheet("CR Summary", ["SAP System", "CR", "Description", "Owner", "Type", "Category", "Target System", "SAP Status", "Lifecycle", "Last Changed Date", "Last Changed Time"]);
  const lifecycle = sheet("Lifecycle", ["SAP System", "CR", "Created DEV", "Released DEV", "QA Status", "QA Imported At", "QA Evidence", "QA Return Code", "PRD Status", "PRD Imported At", "PRD Evidence", "PRD Return Code"]);
  const objects = sheet("Objects & Keys", ["SAP System", "Parent CR", "Transport", "Position", "Program ID", "Object Type", "Object Label", "Object Name", "Diff Readiness", "Table Key"]);
  const tasks = sheet("Child Tasks", ["SAP System", "Parent CR", "Task", "Description", "Owner", "Status", "Changed Date", "Changed Time"]);
  const linked = sheet("Linked Issues", ["SAP System", "CR", "Issue", "Issue Name", "Relation", "Relation Status", "Issue Status", "Linked At", "Unlinked At", "Close Reason"]);
  const requests = await allRows(listCrRequests, filters);
  const exportedRequests = new Set<string>();
  for (const request of requests) {
    const requestKey = `${request.sap_system_code}:${request.trkorr}`;
    if (exportedRequests.has(requestKey)) continue;
    exportedRequests.add(requestKey);
    const detail = await getCrDetailForSystem(request.trkorr, request.sap_system_code);
    const life = detail.lifecycle;
    summary.rows.push([request.sap_system_code, request.trkorr, request.description, request.owner, request.function_code, request.category, request.target_system, request.status_group, request.lifecycle_status, date(request.changed_date), date(request.changed_time)]);
    lifecycle.rows.push([request.sap_system_code, request.trkorr, date(life.created_at), date(life.released_at), life.qa_status, date(life.qa_imported_at), life.qa_evidence_source, life.qa_return_code, life.prd_status, date(life.prd_imported_at), life.prd_evidence_source, life.prd_return_code]);
    const keys = new Map<string, string[]>();
    for (const key of detail.keys) {
      const objectKey = `${key.trkorr}:${key.position}`;
      keys.set(objectKey, [...(keys.get(objectKey) || []), key.table_key || ""]);
    }
    for (const object of detail.objects) objects.rows.push([request.sap_system_code, request.trkorr, object.trkorr, object.position, object.pgmid, object.object_type, object.object_label || object.object_type_description, object.object_name, object.diff_readiness, (keys.get(`${object.trkorr}:${object.position}`) || []).join("; ")]);
    for (const task of detail.tasks) tasks.rows.push([request.sap_system_code, request.trkorr, task.trkorr, task.description, task.owner, task.status_group, date(task.changed_date), date(task.changed_time)]);
    for (const issue of detail.issueLinks) linked.rows.push([request.sap_system_code, request.trkorr, issue.issue_no ? `${issue.issue_no}-${issue.sub_issue_no}` : "", issue.issue_name, issue.relation_type, issue.relation_status, issue.current_issue_status || issue.issue_status_snapshot, date(issue.linked_at), date(issue.unlinked_at), issue.close_reason]);
  }
  return buildXlsx([summary, lifecycle, objects, tasks, linked]);
}

export async function exportIssueReport(filters: Filters): Promise<Buffer> {
  const summary = sheet("Issue Summary", ["Issue", "Name", "Status", "Source Status", "Created On", "Requester", "ABAPer", "Email Subject", "Email Received At", "Problem Analysis", "Impact Analysis", "Primary GLPI", "Primary CR Helpdesk", "Primary CR", "Missing Data Count", "Cancelled At", "Cancelled By", "Cancel Reason"]);
  const transports = sheet("CR Transports", ["Issue", "SAP System", "CR", "Primary", "Relation Type", "Description", "SAP Status", "Lifecycle", "Created DEV", "Released DEV", "QA Import Date", "QA Import Time", "PRD Import Date", "PRD Import Time"]);
  const people = sheet("PICs", ["Issue", "Phase/Role", "Name", "Nickname", "Department", "Primary"]);
  const references = sheet("GLPI & Helpdesk", ["Issue", "Type", "Number", "Primary"]);
  const timeline = sheet("Timeline", ["Issue", "DEV Tested", "DEV Tester", "DEV Evaluated", "DEV Evaluator", "QA Transporter", "QA Tested", "QA Tester", "QA Evaluated", "QA Evaluator", "PRD Requester", "PRD Requested", "PRD Evaluator", "PRD Evaluated", "Approver", "Approval Date", "PRD Transporter"]);
  const history = sheet("Status History", ["Issue", "From", "To", "Reason", "Changed By", "Changed At"]);
  const issues = await allRows(listIssues, filters);
  for (const row of issues) {
    const detail = await getIssueDetail(row.id);
    const issue = detail.issue;
    if (!issue) continue;
    summary.rows.push([row.issue_key, row.issue_name, row.issue_status, row.source_issue_status, date(row.create_issue_date), row.requester_name_snapshot, row.abaper_name_snapshot, issue.email_subject, date(issue.email_date_received), issue.problem_analysis, issue.impact_analysis, row.primary_glpi_ticket, row.primary_cr_helpdesk_no, row.primary_cr, row.missing_data_count, date(issue.cancelled_date), issue.cancelled_by_name_snapshot, issue.cancelled_reason]);
    for (const cr of detail.crLinks) transports.rows.push([row.issue_key, cr.sap_system_code, cr.trkorr, cr.is_primary, cr.relation_type, cr.cr_description_snapshot, cr.status_group, cr.lifecycle_status, date(cr.sap_created_at), date(cr.sap_released_at), date(cr.qa_import_date), date(cr.qa_import_time), date(cr.prd_import_date), date(cr.prd_import_time)]);
    for (const person of detail.participants) people.rows.push([row.issue_key, person.role, person.full_name || person.person_name_snapshot, person.nickname, person.department, person.is_primary]);
    for (const glpi of detail.glpi) references.rows.push([row.issue_key, "GLPI", glpi.ticket_number, glpi.is_primary]);
    for (const helpdesk of detail.crHelpdeskNumbers) references.rows.push([row.issue_key, "CR Helpdesk", helpdesk.cr_helpdesk_no, helpdesk.is_primary]);
    const dev: any = detail.devTimeline || {};
    const qa: any = detail.qaTimeline || {};
    const prd: any = detail.prdTimeline || {};
    timeline.rows.push([row.issue_key, date(dev.dev_tested_date), dev.dev_tester_name_snapshot, date(dev.dev_evaluated_date), dev.dev_evaluator_name_snapshot, qa.transported_by_name_snapshot, date(qa.qa_tested_date), qa.qa_tester_name_snapshot, date(qa.qa_evaluated_date), qa.qa_evaluator_name_snapshot, prd.prd_requester_name_snapshot, date(prd.prd_requested_date), prd.prd_evaluator_name_snapshot, date(prd.prd_evaluated_date), prd.approval_name_snapshot, date(prd.approval_date), prd.executor_name_snapshot]);
    for (const event of detail.statusHistory) history.rows.push([row.issue_key, event.from_status, event.to_status, event.reason, event.changed_by_name_snapshot, date(event.changed_at)]);
  }
  return buildXlsx([summary, transports, people, references, timeline, history]);
}
