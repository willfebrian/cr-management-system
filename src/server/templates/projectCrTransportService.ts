import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CrDetail, IssueDetail } from "../../shared/types.js";
import type {
  ProjectCrReadiness,
  ProjectCrReadinessItem,
  ProjectCrReadinessSection,
  ProjectStatus
} from "../../shared/projectTypes.js";
import { getProjectDetail } from "../db/projectRepository.js";
import { getIssueDetail } from "../db/issueRepository.js";
import { getCrDetailForSystem } from "../db/crRepository.js";
import {
  readZipEntries,
  replaceAllTextAcrossRuns,
  sanitizeFilename,
  stripHighlight,
  writeZipEntries
} from "./crTransportTemplateService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

export type ProjectCrTransportSource = {
  project: {
    id: number;
    projectKey: string;
    projectName: string;
    projectStatus: ProjectStatus;
  };
  issues: IssueDetail[];
  crDetails: Map<string, CrDetail>;
};

export type ProjectCrTransportRow = {
  issueId: number;
  issueKey: string;
  sapSystemCode: string;
  trkorr: string;
  description: string;
  createdDate: string;
  qaTransportedDate: string;
  prdTransportedDate: string;
  qaTester: string;
  abaper: string;
};

export type ProjectCrTransportModel = {
  project: ProjectCrTransportSource["project"];
  firstIssue: IssueDetail;
  latestIssue: IssueDetail;
  requester: string;
  crHelpdesk: string;
  projectName: string;
  qaTransporter: string;
  qaTransportedDate: string;
  qaTester: string;
  qaTestedDate: string;
  qaEvaluator: string;
  qaEvaluatedDate: string;
  prdRequester: string;
  prdRequestedDate: string;
  prdEvaluator: string;
  prdEvaluatedDate: string;
  approval: string;
  approvalDate: string;
  prdTransporter: string;
  prdTransportedDate: string;
  crRows: ProjectCrTransportRow[];
};

const SECTION_TITLES: Record<ProjectCrReadinessSection, string> = {
  project: "Project & Issues",
  initiation: "Issue Initiation",
  qa: "QA Processing",
  prd: "PRD Processing",
  cr: "CR SAP Details"
};
const SECTION_ORDER: ProjectCrReadinessSection[] = ["project", "initiation", "qa", "prd", "cr"];

export function buildProjectCrTransportModel(source: ProjectCrTransportSource): {
  model: ProjectCrTransportModel;
  readiness: ProjectCrReadiness;
} {
  const orderedIssues = source.issues
    .filter((detail) => detail.issue && String(detail.issue.issue_status || "").toLowerCase() !== "cancelled")
    .sort(compareIssueDetails);
  const firstIssue = orderedIssues[0] || emptyIssueDetail();
  const latestIssue = orderedIssues[orderedIssues.length - 1] || emptyIssueDetail();
  const latestPrimaryCr = latestIssue.crLinks.find((link) => link.is_primary) || latestIssue.crLinks[0];
  const crRows = collectCrRows(orderedIssues, source.crDetails);
  const model: ProjectCrTransportModel = {
    project: source.project,
    firstIssue,
    latestIssue,
    requester: participantNames(firstIssue, "requester", "full"),
    crHelpdesk: orderedIssues.flatMap((detail) => detail.crHelpdeskNumbers.map((row) => row.cr_helpdesk_no.trim())).filter(Boolean).filter(unique).join("; "),
    projectName: source.project.projectName.trim(),
    qaTransporter: participantNames(latestIssue, "qa_transporter", "nickname"),
    qaTransportedDate: formatDateDmy(latestPrimaryCr?.qa_import_date),
    qaTester: participantNames(latestIssue, "qa_tester", "nickname"),
    qaTestedDate: formatDateDmy(timelineDate(latestIssue.qaTimeline, "qa_tested_date")),
    qaEvaluator: participantNames(latestIssue, "qa_evaluator", "nickname"),
    qaEvaluatedDate: formatDateDmy(timelineDate(latestIssue.qaTimeline, "qa_evaluated_date")),
    prdRequester: participantNames(latestIssue, "prd_requester", "nickname"),
    prdRequestedDate: formatDateDmy(timelineDate(latestIssue.prdTimeline, "prd_requested_date")),
    prdEvaluator: participantNames(latestIssue, "prd_evaluator", "nickname"),
    prdEvaluatedDate: formatDateDmy(timelineDate(latestIssue.prdTimeline, "prd_evaluated_date")),
    approval: participantNames(latestIssue, "approval", "nickname"),
    approvalDate: formatDateDmy(timelineDate(latestIssue.prdTimeline, "approval_date")),
    prdTransporter: participantNames(latestIssue, "executor", "nickname"),
    prdTransportedDate: formatDateDmy(latestPrimaryCr?.prd_import_date),
    crRows
  };
  const missing = validateModel(model, orderedIssues.length);
  return { model, readiness: groupReadiness(missing) };
}

export async function getProjectCrTransportReadiness(projectId: number) {
  return (await loadProjectCrTransport(projectId)).readiness;
}

import { getAppSetting, renderNamingPattern } from "../utils/namingPattern.js";

export async function buildProjectCrTransportDocument(projectId: number) {
  const result = await loadProjectCrTransport(projectId);
  if (!result.readiness.ready) {
    throw new ProjectCrTransportReadinessError(result.readiness);
  }
  const pattern = await getAppSetting("filename_pattern_project_cr_transport", "CR Transport Project {PROJECT_KEY}.docx");
  return buildProjectCrTransportDocumentFromModel(result.model, undefined, pattern);
}

export function buildProjectCrTransportDocumentFromModel(
  model: ProjectCrTransportModel,
  templatePath = path.join(projectRoot, "templates", "cr_transport_project", "cr_transport_project.docx"),
  pattern = "CR Transport Project {PROJECT_KEY}.docx"
) {
  if (!fs.existsSync(templatePath)) throw new Error(`Template file was not found: ${templatePath}`);
  const entries = readZipEntries(templatePath);
  const document = entries.find((entry) => entry.name === "word/document.xml");
  if (!document) throw new Error("Project CR Transport template is missing word/document.xml.");
  document.data = Buffer.from(renderProjectCrTransportXml(document.data.toString("utf8"), model), "utf8");

  const tokens: Record<string, string> = {
    PROJECT_KEY: model.project.projectKey || "",
    PROJECT_NAME: model.project.projectName || "",
    DATE: new Date().toISOString().split("T")[0]
  };

  let formattedName = renderNamingPattern(pattern, tokens);
  if (!formattedName.toLowerCase().endsWith(".docx")) {
    formattedName += ".docx";
  }

  return {
    filename: sanitizeFilename(formattedName),
    buffer: writeZipEntries(entries)
  };
}

export class ProjectCrTransportReadinessError extends Error {
  constructor(public readonly readiness: ProjectCrReadiness) {
    super("CR Transport Project data is incomplete.");
    this.name = "ProjectCrTransportReadinessError";
  }
}

async function loadProjectCrTransport(projectId: number) {
  const detail = await getProjectDetail(projectId);
  const issueDetails = await Promise.all(detail.issues.filter((issue) => issue.issueId && issue.relationStatus === "active").map((issue) => getIssueDetail(issue.issueId!)));
  const crKeys = new Map<string, { trkorr: string; system: string }>();
  for (const issue of issueDetails) {
    for (const link of issue.crLinks) {
      if (!link.trkorr) continue;
      const system = link.sap_system_code || "DEV";
      crKeys.set(`${system}|${link.trkorr}`, { system, trkorr: link.trkorr });
    }
  }
  const crDetails = new Map<string, CrDetail>();
  await Promise.all([...crKeys.entries()].map(async ([key, value]) => {
    crDetails.set(key, await getCrDetailForSystem(value.trkorr, value.system));
  }));
  return buildProjectCrTransportModel({
    project: {
      id: detail.project.id,
      projectKey: detail.project.projectKey,
      projectName: detail.project.projectName,
      projectStatus: detail.project.projectStatus
    },
    issues: issueDetails,
    crDetails
  });
}

export function renderProjectCrTransportXml(xml: string, model: ProjectCrTransportModel) {
  let rendered = renderCrRows(xml, model.crRows);
  const replacements: Record<string, string> = {
    "[First Issue - Fullname Requester]": model.requester,
    "[All CR Helpdesk]": model.crHelpdesk,
    "[Project Name]": model.projectName,
    "[Latest Issue - Nickname QA Transporter]": model.qaTransporter,
    "[Latest Issue - QA Transported Date (DD.MM.YYYY)]": model.qaTransportedDate,
    "[Latest Issue - Nickname QA Tester]": model.qaTester,
    "[Latest Issue - QA Tested Date (DD.MM.YYYY)]": model.qaTestedDate,
    "[Latest Issue - Nickname QA Evaluator]": model.qaEvaluator,
    "[Latest Issue - QA Evaluated Date (DD.MM.YYYY)]": model.qaEvaluatedDate,
    "[Latest Issue - Nickname PRD Requester]": model.prdRequester,
    "[Latest Issue - PRD Requested Date (DD.MM.YYYY)]": model.prdRequestedDate,
    "[Latest Issue - Nickname PRD Evaluator]": model.prdEvaluator,
    "[Latest Issue - PRD Evaluated Date (DD.MM.YYYY)]": model.prdEvaluatedDate,
    "[Latest Issue - Nickname Approval]": model.approval,
    "[Latest Issue - Approval Date (DD.MM.YYYY)]": model.approvalDate,
    "[Latest Issue - Nickname PRD Transporter]": model.prdTransporter,
    "[Latest Issue - PRD Transported Date (DD.MM.YYYY)]": model.prdTransportedDate
  };
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = replaceAllTextAcrossRuns(rendered, placeholder, value);
  }
  return stripHighlight(normalizeProductionApprovalRowHeights(rendered));
}

function normalizeProductionApprovalRowHeights(xml: string) {
  return xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    const rowText = visibleText(row);
    const isApprovalRow = ["Requested By", "Evaluated By", "Approved By", "Execute By"]
      .some((label) => rowText.includes(label));
    const isTransportHeader = rowText.includes("Transported by") || rowText.includes("Tested by");
    if (!isApprovalRow || isTransportHeader) return row;

    const height = '<w:trHeight w:val="288" w:hRule="atLeast"/>';
    if (/<w:trHeight\b[^>]*\/>/.test(row)) {
      return row.replace(/<w:trHeight\b[^>]*\/>/, height);
    }
    if (/<w:trPr\b[^>]*>/.test(row)) {
      return row.replace(/(<w:trPr\b[^>]*>)/, `$1${height}`);
    }
    return row.replace(/(<w:tr\b[^>]*>)/, `$1<w:trPr>${height}</w:trPr>`);
  });
}

function renderCrRows(xml: string, rows: ProjectCrTransportRow[]) {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (table) => {
    const tableRows = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    const prototypes = tableRows.filter((row) => /\[CR SAP (?:1|2|3|n)\]/.test(visibleText(row)));
    if (!prototypes.length) return table;
    const prototype = prototypes.find((row) => visibleText(row).includes("[CR SAP 1]")) || prototypes[0]!;
    const generated = rows.map((row) => renderCrRow(prototype, row)).join("");
    let inserted = false;
    let renderedTable = table.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (candidate) => {
      if (!prototypes.includes(candidate)) return candidate;
      if (inserted) return "";
      inserted = true;
      return generated;
    });
    const firstRow = tableRows[0];
    if (firstRow && !prototypes.includes(firstRow)) {
      renderedTable = renderedTable.replace(firstRow, addRowProperty(firstRow, "<w:tblHeader/>") );
    }
    return renderedTable;
  });
}

function renderCrRow(prototype: string, row: ProjectCrTransportRow) {
  let rendered = prototype;
  const replacements: Record<string, string> = {
    "[CR SAP 1]": row.trkorr,
    "[CR SAP Description 1]": row.description,
    "[Created CR Date (DD.MM.YYYY)]": row.createdDate,
    "[QA Transported Date (DD.MM.YYYY)]": row.qaTransportedDate,
    "[PRD Transported Date (DD.MM.YYYY)]": row.prdTransportedDate,
    "[Nickname QA Tester]": row.qaTester,
    "[Nickname ABAPer]": row.abaper
  };
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = replaceAllTextAcrossRuns(rendered, placeholder, value);
  }
  return addRowProperty(rendered, "<w:cantSplit/>");
}

function addRowProperty(row: string, property: string) {
  if (row.includes(property.slice(0, -2))) return row;
  if (/<w:trPr\b[^>]*>/.test(row)) return row.replace(/(<w:trPr\b[^>]*>)/, `$1${property}`);
  return row.replace(/(<w:tr\b[^>]*>)/, `$1<w:trPr>${property}</w:trPr>`);
}

function visibleText(xml: string) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1] || "")).join("");
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
}

function collectCrRows(issues: IssueDetail[], details: Map<string, CrDetail>) {
  const rows = new Map<string, ProjectCrTransportRow>();
  for (const issue of issues) {
    for (const link of issue.crLinks) {
      const key = `${link.sap_system_code || "DEV"}|${link.trkorr}`;
      if (!link.trkorr || rows.has(key)) continue;
      const crDetail = details.get(key);
      rows.set(key, {
        issueId: issue.issue!.id,
        issueKey: issue.issue!.issue_key,
        sapSystemCode: link.sap_system_code || "DEV",
        trkorr: link.trkorr,
        description: crDetail?.request?.description?.trim() || link.cr_description_snapshot?.trim() || "",
        createdDate: formatDateDmy(link.sap_created_at || crDetail?.lifecycle.created_at),
        qaTransportedDate: formatDateDmy(link.qa_import_date || crDetail?.lifecycle.qa_imported_at),
        prdTransportedDate: formatDateDmy(link.prd_import_date || crDetail?.lifecycle.prd_imported_at),
        qaTester: participantNames(issue, "qa_tester", "nickname"),
        abaper: participantNames(issue, "abaper", "nickname")
      });
    }
  }
  return [...rows.values()].sort((left, right) => left.trkorr.localeCompare(right.trkorr));
}

function validateModel(model: ProjectCrTransportModel, issueCount: number) {
  const missing: ProjectCrReadinessItem[] = [];
  if (model.project.projectStatus === "cancelled") add(missing, "project-status", "Cancelled Project cannot generate a document", "project");
  required(missing, model.projectName, "project-name", "Project Name", "project");
  if (!issueCount) {
    add(missing, "linked-issues", "At least one active linked Issue", "project");
    if (!model.crRows.length) add(missing, "cr-sap", "At least one CR SAP", "project");
    return missing;
  }
  if (!model.crRows.length) add(missing, "cr-sap", "At least one CR SAP", "project");
  required(missing, model.requester, "first-requester", "Requester", "initiation", model.firstIssue, "issue-requesters");
  required(missing, model.crHelpdesk, "cr-helpdesk", "CR Helpdesk No.", "initiation", model.firstIssue, "issue-glpi");

  required(missing, model.qaTransporter, "qa-transporter", "QA Transporter", "qa", model.latestIssue, "issue-qa-transporter");
  required(missing, model.qaTransportedDate, "qa-transported", "QA Transported Date", "qa", model.latestIssue, "issue-cr");
  required(missing, model.qaTester, "qa-tester", "QA Tester", "qa", model.latestIssue, "issue-qa-tester");
  required(missing, model.qaTestedDate, "qa-tested", "QA Tested Date", "qa", model.latestIssue, "issue-qa-testing-date");
  required(missing, model.qaEvaluator, "qa-evaluator", "QA Evaluator", "qa", model.latestIssue, "issue-qa-evaluator");
  required(missing, model.qaEvaluatedDate, "qa-evaluated", "QA Evaluated Date", "qa", model.latestIssue, "issue-qa-evaluation-date");

  required(missing, model.prdRequester, "prd-requester", "PRD Requester", "prd", model.latestIssue, "issue-prd-requester");
  required(missing, model.prdRequestedDate, "prd-requested", "PRD Requested Date", "prd", model.latestIssue, "issue-prd-request-date");
  required(missing, model.prdEvaluator, "prd-evaluator", "PRD Evaluator", "prd", model.latestIssue, "issue-prd-evaluator");
  required(missing, model.prdEvaluatedDate, "prd-evaluated", "PRD Evaluated Date", "prd", model.latestIssue, "issue-prd-evaluation-date");
  required(missing, model.approval, "approval", "Approver", "prd", model.latestIssue, "issue-approver");
  required(missing, model.approvalDate, "approval-date", "Approval Date", "prd", model.latestIssue, "issue-approval-date");
  required(missing, model.prdTransporter, "prd-transporter", "PRD Transporter", "prd", model.latestIssue, "issue-prd-transporter");
  required(missing, model.prdTransportedDate, "prd-transported", "PRD Transported Date", "prd", model.latestIssue, "issue-cr");

  for (const row of model.crRows) {
    const crId = row.trkorr.replace(/[^A-Za-z0-9_-]/g, "-");
    requiredCr(missing, row.description, `${crId}-description`, "CR SAP Description", row);
    requiredCr(missing, row.createdDate, `${crId}-created`, "Created CR Date", row);
    requiredCr(missing, row.qaTransportedDate, `${crId}-qa`, "QA Transported Date", row);
    requiredCr(missing, row.prdTransportedDate, `${crId}-prd`, "PRD Transported Date", row);
    requiredCr(missing, row.qaTester, `${crId}-tester`, "QA Tester", row, "issue-qa-tester");
    requiredCr(missing, row.abaper, `${crId}-abaper`, "ABAPer", row, "issue-abapers");
  }
  return missing;
}

function required(missing: ProjectCrReadinessItem[], value: string, id: string, label: string, section: ProjectCrReadinessSection, issue?: IssueDetail, targetId?: string) {
  if (value.trim()) return;
  add(missing, id, label, section, issue, targetId);
}

function requiredCr(missing: ProjectCrReadinessItem[], value: string, id: string, label: string, row: ProjectCrTransportRow, targetId = "issue-cr") {
  if (value.trim()) return;
  missing.push({ id, label, section: "cr", issueId: row.issueId, issueKey: row.issueKey, crSap: row.trkorr, targetId });
}

function add(missing: ProjectCrReadinessItem[], id: string, label: string, section: ProjectCrReadinessSection, issue?: IssueDetail, targetId?: string) {
  missing.push({ id, label, section, issueId: issue?.issue?.id, issueKey: issue?.issue?.issue_key, targetId });
}

function groupReadiness(items: ProjectCrReadinessItem[]): ProjectCrReadiness {
  return {
    ready: items.length === 0,
    missingCount: items.length,
    groups: SECTION_ORDER.map((section) => ({ section, title: SECTION_TITLES[section], items: items.filter((item) => item.section === section) })).filter((group) => group.items.length)
  };
}

function compareIssueDetails(left: IssueDetail, right: IssueDetail) {
  const issueDifference = Number(left.issue?.issue_no || 0) - Number(right.issue?.issue_no || 0);
  return issueDifference || String(left.issue?.sub_issue_no || "").localeCompare(String(right.issue?.sub_issue_no || ""), undefined, { numeric: true });
}

function participantNames(detail: IssueDetail, role: string, mode: "full" | "nickname") {
  return detail.participants.filter((participant) => participant.role === role).map((participant) => mode === "nickname"
    ? participant.nickname || participant.person_name_snapshot || participant.full_name || ""
    : participant.full_name || participant.person_name_snapshot || participant.nickname || "").map((value) => value.trim()).filter(Boolean).join("; ");
}

function timelineDate(timeline: Record<string, unknown> | null, key: string) {
  const value = timeline?.[key];
  return typeof value === "string" ? value : "";
}

export function formatDateDmy(value?: unknown) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return formatValidDate(value);
  const normalized = String(value).trim();
  if (!normalized) return "";
  const ymd = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}.${ymd[2]}.${ymd[1]}`;
  return formatValidDate(new Date(normalized));
}

function formatValidDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function unique(value: string, index: number, values: string[]) {
  return values.indexOf(value) === index;
}

function emptyIssueDetail(): IssueDetail {
  return { issue: null, glpi: [], crHelpdeskNumbers: [], crLinks: [], devTimeline: null, qaTimeline: null, prdTimeline: null, participants: [], statusHistory: [] };
}
