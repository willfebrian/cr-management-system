type IssueAiDisabledState = {
  formDisabled: boolean;
  devDisabled: boolean;
  qaDisabled: boolean;
  prdRequestDisabled: boolean;
  prdTransportDisabled: boolean;
};

type AiPersonDirectoryEntry = {
  full_name: string | null;
  nickname: string | null;
  is_active: boolean;
};

const DEV_PARTICIPANTS = new Set(["dev_tester", "dev_evaluator"]);
const QA_PARTICIPANTS = new Set(["qa_transporter", "qa_tester", "qa_evaluator"]);
const PRD_REQUEST_PARTICIPANTS = new Set(["prd_requester", "prd_evaluator", "approval"]);

const DEV_TIMELINE = new Set(["dev_tested_date", "dev_evaluated_date"]);
const QA_TIMELINE = new Set(["qa_tested_date", "qa_evaluated_date"]);
const PRD_REQUEST_TIMELINE = new Set(["prd_requested_date", "prd_evaluated_date", "approval_date"]);

export function createIssueAiFieldPolicy(state: IssueAiDisabledState) {
  return {
    canUpdateCoreField() {
      return !state.formDisabled;
    },
    canUpdateParticipant(role: string) {
      if (state.formDisabled) return false;
      if (DEV_PARTICIPANTS.has(role)) return !state.devDisabled;
      if (QA_PARTICIPANTS.has(role)) return !state.qaDisabled;
      if (PRD_REQUEST_PARTICIPANTS.has(role)) return !state.prdRequestDisabled;
      if (role === "executor") return !state.prdTransportDisabled;
      return role === "requester" || role === "abaper";
    },
    canUpdateTimeline(key: string) {
      if (state.formDisabled) return false;
      if (DEV_TIMELINE.has(key)) return !state.devDisabled;
      if (QA_TIMELINE.has(key)) return !state.qaDisabled;
      if (PRD_REQUEST_TIMELINE.has(key)) return !state.prdRequestDisabled;
      return false;
    }
  };
}

function comparableName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function canonicalizeAiParticipantName(value: string, people: AiPersonDirectoryEntry[]) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const comparable = comparableName(trimmed);
  const withoutParenthetical = comparableName(trimmed.replace(/\s*\([^)]*\)\s*$/, ""));
  const match = people.find((person) => {
    if (!person.is_active || !person.full_name?.trim()) return false;
    const fullName = comparableName(person.full_name);
    const nickname = comparableName(person.nickname || "");
    const displayName = nickname ? `${fullName} (${nickname})` : fullName;
    return comparable === fullName
      || comparable === nickname
      || comparable === displayName
      || withoutParenthetical === fullName;
  });

  return match?.full_name?.trim() || trimmed;
}

export function hasBlockingIssueDialog(state: {
  hasTemplatePreview?: boolean;
  actionDialog?: string;
  missingPeopleCount?: number;
  showAiOverwriteModal?: boolean;
}) {
  return Boolean(
    state.hasTemplatePreview
    || state.actionDialog
    || state.missingPeopleCount
    || state.showAiOverwriteModal
  );
}

export function findExactCrValueHelpRow<T extends Record<string, unknown>>(token: string, rows: T[]) {
  const expected = String(token || "").trim().toUpperCase();
  return rows.find((row) => String(row.trkorr || "").trim().toUpperCase() === expected);
}

export function buildReferenceLookupTrigger(tokens: string[], issueId?: number | null) {
  return `${tokens.join("|")}::${issueId ?? "create"}`;
}
