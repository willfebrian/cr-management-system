import type { ReleaseCandidateRow } from "../../api/transportReleaseApi";

export type IssueLinkedCr = {
  sap_system_code: string;
  trkorr: string;
  lifecycle_status?: string;
  status_group?: string;
  cr_description_snapshot?: string;
};

export type IssueReleaseCheck = Pick<{ ok: boolean; hasErrors: boolean }, "ok" | "hasErrors">;

export function normalizeIssueReleaseTarget(systemCode: string) {
  const normalized = String(systemCode || "").trim().toUpperCase();
  if (normalized === "DEV" || normalized === "TRD" || normalized === "DEV_AIX") return "DEV_AIX";
  return normalized;
}

export function normalizeIssueReleaseLifecycle(lifecycleStatus?: string) {
  const normalized = String(lifecycleStatus || "").trim().toLowerCase();
  return normalized === "outstanding" ? "created" : normalized;
}

export function buildIssueReleaseCandidates(links: IssueLinkedCr[]): ReleaseCandidateRow[] {
  return links
    .filter((link) => normalizeIssueReleaseLifecycle(link.lifecycle_status) === "created")
    .map((link) => ({
      trkorr: String(link.trkorr || "").trim().toUpperCase(),
      description: String(link.cr_description_snapshot || ""),
      owner: "",
      statusGroup: String(link.status_group || "outstanding"),
      changedDate: null,
      targetSystem: normalizeIssueReleaseTarget(link.sap_system_code),
      taskCount: 0
    }))
    .filter((candidate) => Boolean(candidate.trkorr && candidate.targetSystem));
}

export function getChangeIssueReleaseCandidates(mode: "create" | "change", links: IssueLinkedCr[]) {
  return mode === "change" ? buildIssueReleaseCandidates(links) : [];
}

export function didIssueReleaseSelectionChange(previous: string[], next: string[]) {
  if (previous.length !== next.length) return true;
  const prior = [...previous].sort();
  const current = [...next].sort();
  return prior.some((request, index) => request !== current[index]);
}

export function isIssueReleaseReady(
  selected: string[],
  checks: Record<string, IssueReleaseCheck | undefined>
) {
  return selected.length > 0 && selected.every((request) => {
    const result = checks[request];
    return Boolean(result?.ok && !result.hasErrors);
  });
}
