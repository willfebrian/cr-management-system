import assert from "node:assert/strict";
import test from "node:test";
import type { IssueDetail } from "../src/shared/types";
import {
  afterIncompleteSectionRender,
  expandSection,
  getIncompleteItems,
  groupIncompleteItems,
  markIncompleteTarget
} from "../src/client/issueIncomplete";

function issueDetail(overrides: Partial<IssueDetail> = {}): IssueDetail {
  return {
    issue: {
      id: 1,
      issue_no: 26041,
      sub_issue_no: "01",
      issue_key: "26041-01",
      issue_name: "Example issue",
      issue_status: "in_progress",
      source_issue_status: "open",
      requester_name_snapshot: "Requester One",
      abaper_name_snapshot: "ABAPer One",
      create_issue_date: "2026-07-29T08:00:00.000Z"
    },
    glpi: [{ id: 1, ticket_number: 12345, is_primary: true }],
    crHelpdeskNumbers: [],
    crLinks: [{
      id: 1,
      sap_system_code: "DEV",
      trkorr: "TRDK900001",
      relation_type: "primary",
      is_primary: true
    }],
    devTimeline: null,
    qaTimeline: null,
    prdTimeline: null,
    participants: [
      { id: 1, role: "requester", source_field: "requester", person_name_snapshot: "Requester One", is_primary: true },
      { id: 2, role: "abaper", source_field: "abaper", person_name_snapshot: "ABAPer One", is_primary: true }
    ],
    statusHistory: [],
    ...overrides
  };
}

test("groups DEV participant and timeline gaps under DEV Processing", () => {
  const groups = groupIncompleteItems(getIncompleteItems(issueDetail()));
  const dev = groups.find((group) => group.section === "dev");

  assert.deepEqual(dev?.items.map((item) => item.label), [
    "DEV Tester",
    "Testing Date",
    "DEV Evaluator",
    "Evaluation Date"
  ]);
});

test("omits a group when every field in that section is complete", () => {
  const detail = issueDetail({
    participants: [
      { id: 1, role: "requester", source_field: "requester", person_name_snapshot: "Requester One", is_primary: true },
      { id: 2, role: "abaper", source_field: "abaper", person_name_snapshot: "ABAPer One", is_primary: true },
      { id: 3, role: "dev_tester", source_field: "dev_tester", person_name_snapshot: "Tester One", is_primary: true },
      { id: 4, role: "dev_evaluator", source_field: "dev_evaluator", person_name_snapshot: "Evaluator One", is_primary: true }
    ],
    devTimeline: {
      dev_tested_date: "2026-07-29T09:00:00.000Z",
      dev_evaluated_date: "2026-07-29T10:00:00.000Z"
    }
  });

  const groups = groupIncompleteItems(getIncompleteItems(detail));

  assert.equal(groups.some((group) => group.section === "dev"), false);
});

test("expands only the requested collapsed section", () => {
  assert.deepEqual(
    expandSection({ initiation: true, dev: false, qa: false, prd: false }, "qa"),
    { initiation: true, dev: false, qa: true, prd: false }
  );
});

test("maps incomplete entries to stable field targets", () => {
  const detail = issueDetail({
    issue: {
      ...issueDetail().issue!,
      requester_name_snapshot: undefined
    },
    participants: []
  });
  const items = getIncompleteItems(detail);

  assert.equal(items.find((item) => item.label === "Requester")?.targetId, "issue-requesters");
  assert.equal(items.find((item) => item.label === "DEV Evaluator")?.targetId, "issue-dev-evaluator");
  assert.equal(items.find((item) => item.label === "Approval Date")?.targetId, "issue-approval-date");
});

test("marks a navigation target until the highlight cleanup runs", () => {
  const attributes = new Map<string, string>();
  let cleanup = () => {};
  const target = {
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    }
  };

  markIncompleteTarget(target, (callback) => {
    cleanup = callback;
    return 1;
  });

  assert.equal(attributes.get("data-incomplete-active"), "true");
  cleanup();
  assert.equal(attributes.has("data-incomplete-active"), false);
});

test("waits through two render frames before navigating to a newly expanded field", () => {
  const frames: Array<() => void> = [];
  let navigated = false;

  afterIncompleteSectionRender(() => {
    navigated = true;
  }, (callback) => {
    frames.push(callback);
    return frames.length;
  });

  assert.equal(navigated, false);
  frames.shift()?.();
  assert.equal(navigated, false);
  frames.shift()?.();
  assert.equal(navigated, true);
});
