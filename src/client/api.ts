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

export async function fetchValueHelp(kind: ValueHelpKind, q = "", options?: { role?: string }): Promise<{ rows: Array<Record<string, unknown>> }> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (options?.role) params.set("role", options.role);
  return fetchJson(`/api/value-help/${kind}${params.toString() ? `?${params}` : ""}`);
}

export type AdminPersonRow = {
  id: number;
  full_name: string | null;
  nickname: string | null;
  email: string | null;
  department: string | null;
  is_active: boolean;
  is_requester: boolean;
  is_abaper: boolean;
  is_tester: boolean;
  is_evaluator: boolean;
  is_approver: boolean;
  is_transporter: boolean;
};

export async function fetchAdminPeople(): Promise<{ rows: AdminPersonRow[] }> {
  return fetchJson("/api/admin/people");
}

export async function createAdminPerson(data: { full_name: string; nickname: string; email: string }): Promise<AdminPersonRow> {
  return fetchJson("/api/admin/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function updateAdminPerson(id: number, data: Partial<AdminPersonRow>): Promise<{ ok: boolean }> {
  return fetchJson(`/api/admin/people/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function deleteAdminPerson(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/admin/people/${id}`, {
    method: "DELETE"
  });
}

export async function fetchAdminSettings(): Promise<Record<string, string>> {
  return fetchJson("/api/admin/settings");
}

export async function updateAdminSettings(settings: Record<string, string>): Promise<{ ok: boolean }> {
  return fetchJson("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
}

export type GroupEmailRow = {
  id: number;
  email_address: string;
  name: string | null;
  is_active: boolean;
  created_at?: string;
};

export async function fetchGroupEmails(): Promise<{ rows: GroupEmailRow[] }> {
  return fetchJson("/api/admin/group-emails");
}

export async function createGroupEmail(data: { email_address: string; name?: string }): Promise<GroupEmailRow> {
  return fetchJson("/api/admin/group-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function updateGroupEmail(id: number, data: Partial<GroupEmailRow>): Promise<{ ok: boolean }> {
  return fetchJson(`/api/admin/group-emails/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function deleteGroupEmail(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/admin/group-emails/${id}`, {
    method: "DELETE"
  });
}

export type OutlookSearchEmailResult = {
  receivedAt: string;
  senderName: string;
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
};

export async function searchOutlookEmail(subject: string): Promise<{ rows: OutlookSearchEmailResult[] }> {
  // 1. Try Local Client Agent on user's Windows laptop (Passwordless local MAPI)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const localRes = await fetch(`http://127.0.0.1:18888/api/fetch-outlook?q=${encodeURIComponent(subject)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (localRes.ok) {
      const data = await localRes.json();
      if (data && Array.isArray(data.rows) && data.rows.length > 0) {
        return data;
      }
    }
  } catch {
    // Local Agent not active, proceed to central backend fallback
  }

  // 2. Central Server Backend Fallback
  return fetchJson(`/api/outlook/search-email?q=${encodeURIComponent(subject)}`);
}

export type AiAnalysisResult = {
  problemAnalysis: string;
  impactAnalysis: string;
};

export async function generateAnalysis(emailContext: string, emailSubject?: string): Promise<AiAnalysisResult> {
  return fetchJson("/api/ai/generate-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailContext, emailSubject })
  });
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
  const response = await fetch(url, { ...init, credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Request failed: ${response.status}`);
  return body;
}

export type AuthUser = { id: number; username: string; role: "ADMIN" | "USER"; mustChangePassword: boolean; lastLoginAt?: string | null };
export async function login(username: string, password: string) { return fetchJson<{ user: AuthUser }>("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); }
export async function fetchCurrentUser() { return fetchJson<{ user: AuthUser }>("/api/auth/me"); }
export async function logout() { return fetchJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" }); }
export async function changePassword(currentPassword: string, newPassword: string) { return fetchJson<{ ok: boolean }>("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }); }

export * from "./api/projectApi.js";
