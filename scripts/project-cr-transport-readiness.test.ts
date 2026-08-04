import assert from "node:assert/strict";
import test from "node:test";
import type { CrDetail, IssueDetail } from "../src/shared/types.js";
import {
  buildProjectCrTransportModel,
  type ProjectCrTransportSource
} from "../src/server/templates/projectCrTransportService.js";

function issue(id: number, key: string, overrides: Partial<IssueDetail> = {}): IssueDetail {
  const [issueNo, subIssueNo] = key.split("-");
  return {
    issue: {
      id,
      issue_no: Number(issueNo),
      sub_issue_no: subIssueNo!,
      issue_key: key,
      issue_name: `Issue ${key}`,
      issue_status: "in_progress",
      requester_name_snapshot: "Requester Full",
      abaper_name_snapshot: "ABAP Full"
    },
    glpi: [],
    crHelpdeskNumbers: [{ id, cr_helpdesk_no: `CRH-${id}`, is_primary: true }],
    crLinks: [{
      id,
      sap_system_code: "DEV",
      trkorr: `TRDK${id}`,
      relation_type: "primary",
      is_primary: true,
      sap_created_at: "2026-07-01",
      qa_import_date: "2026-07-02",
      prd_import_date: "2026-07-03"
    }],
    devTimeline: null,
    qaTimeline: { qa_tested_date: "2026-07-02", qa_evaluated_date: "2026-07-02" },
    prdTimeline: {
      prd_requested_date: "2026-07-03",
      prd_evaluated_date: "2026-07-03",
      approval_date: "2026-07-03"
    },
    participants: [
      participant("requester", "Requester Full", "REQ"),
      participant("abaper", "ABAP Full", "ABAP"),
      participant("qa_transporter", "QA Transporter", "QATR"),
      participant("qa_tester", "QA Tester", "QATEST"),
      participant("qa_evaluator", "QA Evaluator", "QAEVAL"),
      participant("prd_requester", "PRD Requester", "PRDREQ"),
      participant("prd_evaluator", "PRD Evaluator", "PRDEVAL"),
      participant("approval", "Approver", "APP"),
      participant("executor", "PRD Transporter", "PRDTR")
    ],
    statusHistory: [],
    ...overrides
  };
}

function participant(role: string, fullName: string, nickname: string) {
  return {
    id: Math.floor(Math.random() * 10_000),
    role,
    source_field: role,
    person_name_snapshot: fullName,
    is_primary: true,
    full_name: fullName,
    nickname
  };
}

function cr(trkorr: string): CrDetail {
  return {
    request: { sap_system_code: "DEV", trkorr, description: `Description ${trkorr}`, status_group: "released" },
    tasks: [],
    lifecycle: { qa_status: "imported", prd_status: "imported" },
    objects: [],
    keys: [],
    issueLinks: []
  };
}

test("selects First and Latest Issue by numeric Issue key and deduplicates CR rows", () => {
  const first = issue(1, "26002-02");
  const latest = issue(2, "26010-01");
  latest.crLinks.push({ ...latest.crLinks[0]!, id: 99 });
  const source: ProjectCrTransportSource = {
    project: { id: 7, projectKey: "PRJ-26007", projectName: "Project Alpha", projectStatus: "in_progress" },
    issues: [latest, first],
    crDetails: new Map([
      ["DEV|TRDK1", cr("TRDK1")],
      ["DEV|TRDK2", cr("TRDK2")]
    ])
  };

  const result = buildProjectCrTransportModel(source);

  assert.equal(result.model.firstIssue.issue?.issue_key, "26002-02");
  assert.equal(result.model.latestIssue.issue?.issue_key, "26010-01");
  assert.deepEqual(result.model.crRows.map((row) => row.trkorr), ["TRDK1", "TRDK2"]);
  assert.equal(result.readiness.ready, true);
});

test("groups missing data with exact Issue navigation targets", () => {
  const incomplete = issue(3, "26011-01", {
    qaTimeline: { qa_tested_date: "", qa_evaluated_date: "" },
    participants: issue(3, "26011-01").participants.filter((row) => row.role !== "qa_evaluator")
  });

  const result = buildProjectCrTransportModel({
    project: { id: 8, projectKey: "PRJ-26008", projectName: "Project Beta", projectStatus: "in_progress" },
    issues: [incomplete],
    crDetails: new Map([["DEV|TRDK3", cr("TRDK3")]])
  });

  assert.equal(result.readiness.ready, false);
  const qaGroup = result.readiness.groups.find((group) => group.section === "qa");
  assert.ok(qaGroup);
  assert.deepEqual(qaGroup.items.map((item) => [item.issueKey, item.label, item.targetId]), [
    ["26011-01", "QA Tested Date", "issue-qa-testing-date"],
    ["26011-01", "QA Evaluator", "issue-qa-evaluator"],
    ["26011-01", "QA Evaluated Date", "issue-qa-evaluation-date"]
  ]);
});

test("reports structural blockers without flooding the modal with unavailable Issue fields", () => {
  const result = buildProjectCrTransportModel({
    project: { id: 9, projectKey: "PRJ-26009", projectName: "Empty Project", projectStatus: "planned" },
    issues: [],
    crDetails: new Map()
  });
  assert.equal(result.readiness.ready, false);
  assert.deepEqual(result.readiness.groups.flatMap((group) => group.items.map((item) => item.label)), [
    "At least one active linked Issue",
    "At least one CR SAP"
  ]);
});

test("routes a missing CR Helpdesk number to the existing References field", () => {
  const missingReference = issue(4, "26012-01", { crHelpdeskNumbers: [] });
  const result = buildProjectCrTransportModel({
    project: { id: 10, projectKey: "PRJ-26010", projectName: "References", projectStatus: "in_progress" },
    issues: [missingReference],
    crDetails: new Map([["DEV|TRDK4", cr("TRDK4")]])
  });
  const item = result.readiness.groups.flatMap((group) => group.items).find((entry) => entry.id === "cr-helpdesk");
  assert.equal(item?.targetId, "issue-glpi");
});

test("formats PostgreSQL Date objects returned for SAP creation timestamps", () => {
  const pgDateIssue = issue(5, "26013-01");
  pgDateIssue.crLinks[0]!.sap_created_at = new Date("2026-06-22T01:00:00.000Z") as unknown as string;
  const result = buildProjectCrTransportModel({
    project: { id: 11, projectKey: "PRJ-26011", projectName: "Date Handling", projectStatus: "in_progress" },
    issues: [pgDateIssue],
    crDetails: new Map([["DEV|TRDK5", cr("TRDK5")]])
  });
  assert.equal(result.model.crRows[0]?.createdDate, "22.06.2026");
});
