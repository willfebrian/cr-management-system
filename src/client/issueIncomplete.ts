import type { IssueDetail } from "../shared/types";

export type IssueSection = "initiation" | "dev" | "qa" | "prd";

export type IncompleteItem = {
  id: string;
  label: string;
  section: IssueSection;
  targetId: string;
};

export type IncompleteGroup = {
  section: IssueSection;
  title: string;
  items: IncompleteItem[];
};

export type ExpandedIssueSections = Record<IssueSection, boolean>;

type IncompleteTargetMarker = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

type HighlightScheduler = (callback: () => void, delay: number) => unknown;
type RenderFrameScheduler = (callback: () => void) => unknown;

const SECTION_TITLES: Record<IssueSection, string> = {
  initiation: "Issue Initiation",
  dev: "DEV Processing",
  qa: "QA Processing",
  prd: "PRD Processing"
};

const SECTION_ORDER: IssueSection[] = ["initiation", "dev", "qa", "prd"];

function hasParticipant(detail: IssueDetail, role: string) {
  return detail.participants.some((participant) => participant.role === role);
}

function timelineDate(source: Record<string, unknown> | null, key: string) {
  return typeof source?.[key] === "string" && Boolean(String(source[key]).trim());
}

function item(id: string, label: string, section: IssueSection, targetId: string): IncompleteItem {
  return { id, label, section, targetId };
}

export function getIncompleteItems(detail: IssueDetail): IncompleteItem[] {
  const issue = detail.issue;
  if (!issue) return [item("issue-header", "Issue Header", "initiation", "issue-name")];

  const missing: IncompleteItem[] = [];
  if (!issue.issue_name?.trim()) missing.push(item("issue-name", "Issue Name", "initiation", "issue-name"));
  if (!issue.requester_name_snapshot?.trim() && !hasParticipant(detail, "requester")) {
    missing.push(item("requester", "Requester", "initiation", "issue-requesters"));
  }
  if (!issue.abaper_name_snapshot?.trim() && !hasParticipant(detail, "abaper")) {
    missing.push(item("abaper", "ABAPer", "initiation", "issue-abapers"));
  }
  if (!issue.create_issue_date) missing.push(item("created-date", "Created On", "initiation", "issue-created-on"));
  if (!detail.glpi.length) missing.push(item("glpi-ticket", "GLPI No.", "initiation", "issue-glpi"));
  if (!detail.crLinks.length) missing.push(item("cr-link", "CR SAP No.", "initiation", "issue-cr"));

  if (!hasParticipant(detail, "dev_tester")) {
    missing.push(item("dev-tester", "DEV Tester", "dev", "issue-dev-tester"));
  }
  if (!timelineDate(detail.devTimeline, "dev_tested_date")) {
    missing.push(item("dev-tested-date", "Testing Date", "dev", "issue-dev-testing-date"));
  }
  if (!hasParticipant(detail, "dev_evaluator")) {
    missing.push(item("dev-evaluator", "DEV Evaluator", "dev", "issue-dev-evaluator"));
  }
  if (!timelineDate(detail.devTimeline, "dev_evaluated_date")) {
    missing.push(item("dev-evaluated-date", "Evaluation Date", "dev", "issue-dev-evaluation-date"));
  }

  if (!hasParticipant(detail, "qa_transporter")) {
    missing.push(item("qa-transporter", "QA Transporter", "qa", "issue-qa-transporter"));
  }
  if (!hasParticipant(detail, "qa_tester")) {
    missing.push(item("qa-tester", "QA Tester", "qa", "issue-qa-tester"));
  }
  if (!timelineDate(detail.qaTimeline, "qa_tested_date")) {
    missing.push(item("qa-tested-date", "Testing Date", "qa", "issue-qa-testing-date"));
  }
  if (!hasParticipant(detail, "qa_evaluator")) {
    missing.push(item("qa-evaluator", "QA Evaluator", "qa", "issue-qa-evaluator"));
  }
  if (!timelineDate(detail.qaTimeline, "qa_evaluated_date")) {
    missing.push(item("qa-evaluated-date", "Evaluation Date", "qa", "issue-qa-evaluation-date"));
  }

  if (!hasParticipant(detail, "prd_requester")) {
    missing.push(item("prd-requester", "PRD Requester", "prd", "issue-prd-requester"));
  }
  if (!timelineDate(detail.prdTimeline, "prd_requested_date")) {
    missing.push(item("prd-requested-date", "Request Date", "prd", "issue-prd-request-date"));
  }
  if (!hasParticipant(detail, "prd_evaluator")) {
    missing.push(item("prd-evaluator", "PRD Evaluator", "prd", "issue-prd-evaluator"));
  }
  if (!timelineDate(detail.prdTimeline, "prd_evaluated_date")) {
    missing.push(item("prd-evaluated-date", "Evaluation Date", "prd", "issue-prd-evaluation-date"));
  }
  if (!hasParticipant(detail, "approval")) {
    missing.push(item("approval", "Approver", "prd", "issue-approver"));
  }
  if (!timelineDate(detail.prdTimeline, "approval_date")) {
    missing.push(item("approval-date", "Approval Date", "prd", "issue-approval-date"));
  }
  if (!hasParticipant(detail, "executor")) {
    missing.push(item("prd-transporter", "PRD Transporter", "prd", "issue-prd-transporter"));
  }

  return missing;
}

export function groupIncompleteItems(items: IncompleteItem[]): IncompleteGroup[] {
  return SECTION_ORDER
    .map((section) => ({
      section,
      title: SECTION_TITLES[section],
      items: items.filter((entry) => entry.section === section)
    }))
    .filter((group) => group.items.length > 0);
}

export function expandSection(current: ExpandedIssueSections, section: IssueSection): ExpandedIssueSections {
  if (current[section]) return current;
  return { ...current, [section]: true };
}

export function markIncompleteTarget(
  target: IncompleteTargetMarker,
  schedule: HighlightScheduler = (callback, delay) => window.setTimeout(callback, delay)
) {
  target.setAttribute("data-incomplete-active", "true");
  schedule(() => target.removeAttribute("data-incomplete-active"), 1800);
}

export function afterIncompleteSectionRender(
  navigate: () => void,
  schedule: RenderFrameScheduler = (callback) => window.requestAnimationFrame(callback)
) {
  let cancelled = false;
  schedule(() => {
    if (cancelled) return;
    schedule(() => {
      if (!cancelled) navigate();
    });
  });
  return () => {
    cancelled = true;
  };
}
