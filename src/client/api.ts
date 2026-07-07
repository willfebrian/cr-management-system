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

export async function fetchIssueTemplate(id: number, kind: "email" | "ticket"): Promise<{
  kind: "email" | "ticket";
  title: string;
  templatePath: string;
  body: string;
  bodyHtml?: string;
}> {
  return fetchJson(`/api/issues/${id}/templates/${kind}`);
}

export async function downloadCrTransportTemplate(id: number) {
  const response = await fetch(`/api/issues/${id}/templates/cr-transport`);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {
      const text = await response.text().catch(() => "");
      if (text) message = text;
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("content-disposition")) || "CR Transport.docx";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenameFromDisposition(disposition: string | null) {
  if (!disposition) return "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const quoted = disposition.match(/filename="([^"]+)"/i)?.[1];
  return quoted || "";
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

export type IssuePersonCheck = {
  name: string;
  mode: "full_name" | "nickname";
};

export type IssuePersonRegistration = {
  fullName: string;
  nickname: string;
  department: string;
  email?: string;
};

export async function validateIssuePeople(people: IssuePersonCheck[]): Promise<{ missing: IssuePersonCheck[] }> {
  return fetchJson("/api/value-help/people/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ people })
  });
}

export async function registerIssuePeople(people: IssuePersonRegistration[]): Promise<{ rows: Array<Record<string, unknown>> }> {
  return fetchJson("/api/value-help/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ people })
  });
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
