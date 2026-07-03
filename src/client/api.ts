import type { CrDetail, CrRequest, DashboardData, IssueDetail, IssueRow, SapSystemConfig, StatusTrendData } from "../shared/types";

export async function fetchDashboard(): Promise<DashboardData> {
  return fetchJson("/api/dashboard");
}

export async function fetchStatusTrend(filters: { fromPeriod: string; toPeriod: string }): Promise<StatusTrendData> {
  const params = new URLSearchParams({
    fromPeriod: filters.fromPeriod,
    toPeriod: filters.toPeriod
  });
  return fetchJson(`/api/dashboard/status-trend?${params}`);
}

export type CrFilters = {
  sapSystemCode?: string;
  status?: string;
  lifecycleStatus?: string;
  owner?: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchCrList(filters: CrFilters = {}): Promise<{
  rows: CrRequest[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  dbFetchedAt?: string;
  lastSuccessfulSyncAt?: string | null;
  syncHealth?: DashboardData["syncHealth"];
}> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params}` : "";
  return fetchJson(`/api/cr${suffix}`);
}

export async function fetchCrDetail(trkorr: string, sapSystemCode: string): Promise<CrDetail> {
  const params = new URLSearchParams({ sapSystemCode });
  return fetchJson(`/api/cr/${encodeURIComponent(trkorr)}?${params}`);
}

export async function fetchSystems(): Promise<{ rows: SapSystemConfig[] }> {
  return fetchJson("/api/systems");
}

export type IssueFilters = {
  status?: string;
  q?: string;
  requester?: string;
  abaper?: string;
  crHelpdesk?: string;
  cr?: string;
  glpi?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchIssueList(filters: IssueFilters = {}): Promise<{
  rows: IssueRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  dbFetchedAt?: string;
  lastSuccessfulSyncAt?: string | null;
  syncHealth?: DashboardData["syncHealth"];
}> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params}` : "";
  return fetchJson(`/api/issues${suffix}`);
}

export async function fetchIssueDetail(id: number): Promise<IssueDetail> {
  return fetchJson(`/api/issues/${id}`);
}

export type IssueSavePayload = {
  id?: number;
  createMode?: "new" | "sub";
  issueNo?: number | string;
  subIssueNo?: string;
  issueName: string;
  requesterNames?: string;
  abaperNames?: string;
  problemAnalysis?: string;
  impactAnalysis?: string;
  emailSubject?: string;
  createIssueDate?: string;
  sourceIssueStatus?: string;
  cancelledDate?: string;
  cancelledReason?: string;
  crHelpdeskNumbers?: string;
  glpiTickets?: string;
  crLinks?: string;
  participants?: Record<string, string | undefined>;
  timeline?: Record<string, string | undefined>;
};

export async function saveIssue(payload: IssueSavePayload): Promise<IssueDetail> {
  const isUpdate = Boolean(payload.id);
  return fetchJson(`/api/issues${isUpdate ? `/${payload.id}` : ""}`, {
    method: isUpdate ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function cancelIssue(id: number, reason: string): Promise<IssueDetail> {
  return fetchJson(`/api/issues/${id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
}

export async function deleteIssue(id: number): Promise<{ ok: boolean; id: number }> {
  return fetchJson(`/api/issues/${id}`, { method: "DELETE" });
}

export async function fetchIssueStatusOptions(): Promise<{ rows: Array<{ issue_status: string; count: number }> }> {
  return fetchJson("/api/issues/status-options");
}

export async function fetchNextIssueNumber(): Promise<{ issueNo: number }> {
  return fetchJson("/api/issues/next-number");
}

export async function fetchNextSubIssueNumber(issueNo: number | string): Promise<{ issueNo: number; subIssueNo: string }> {
  const params = new URLSearchParams({ issueNo: String(issueNo) });
  return fetchJson(`/api/issues/next-sub-issue?${params}`);
}

export type ValueHelpKind = "people" | "glpi" | "cr-helpdesk" | "cr";

export async function fetchValueHelp(kind: ValueHelpKind, q = ""): Promise<{ rows: Array<Record<string, unknown>> }> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  return fetchJson(`/api/value-help/${kind}${params.toString() ? `?${params}` : ""}`);
}

export type SyncCrOptions = {
  systemCode?: string;
  systemCodes?: string[];
  fromDate: string;
  toDate: string;
  syncMode?: "incremental" | "full_period";
  lookbackDays?: number;
  rowCount?: number;
};

export type SyncCrResult = {
  ok: boolean;
  requestCount: number;
  orphanImportsFound?: number;
  orphanImportsRecovered?: number;
  orphanImportsFailed?: number;
  message?: string;
  results: Array<{
    systemCode: string;
    syncRunId: number;
    status: "success" | "failed";
    requestCount: number;
    summary?: Record<string, number>;
    period?: { fromDate: string; toDate: string; periodType: string; periodValue?: number | null };
    message?: string;
  }>;
  lifecycleResults?: Array<{
    targetSystemCode: string;
    evidenceSource: string;
    logCount?: number;
    orphanImportsFound?: number;
    orphanImportsRecovered?: number;
    orphanImportsFailed?: number;
    message?: string;
    period?: { fromDate: string; toDate: string; periodType: string; periodValue?: number | null };
  }>;
};

export async function syncCr(options: SyncCrOptions): Promise<SyncCrResult> {
  return fetchJson<SyncCrResult>("/api/sync/cr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Request failed: ${response.status}`);
  return body;
}
