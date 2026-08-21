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
  agingDays?: number;
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
  lifecycleStatus?: string;
  completionStatus?: string;
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
  previewHtml?: string;
}> {
  return fetchJson(`/api/issues/${id}/templates/${kind}`);
}

export async function fetchGlpiPrefillActors(id: number): Promise<{
  abaperGlpiUserIds: number[];
}> {
  return fetchJson(`/api/issues/${id}/glpi-prefill-actors`);
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

export async function downloadCrTransportBatch(issueIds: number[]) {
  const response = await fetch("/api/issues/templates/cr-transport/batch", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueIds })
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try { message = (await response.json())?.message || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("content-disposition")) || "CR-Transport-Forms.zip";
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
  requestDescription?: string;
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

export type GlpiTicketParticipant = { userId: number; username: string; fullName: string };
export type GlpiTicketFollowup = { id: number; date: string; author: string; content: string };
export type GlpiTicketSolution = { id: number; date: string; solver: string; content: string };

export type GlpiTicketDetail = {
  ticketNumber: number;
  title: string;
  content: string;
  date: string;
  status: number | string;
  solvedate?: string | null;
  closedate?: string | null;
  requesters: GlpiTicketParticipant[];
  technicians: GlpiTicketParticipant[];
  observers: GlpiTicketParticipant[];
  followups: GlpiTicketFollowup[];
  solutions: GlpiTicketSolution[];
};

export async function fetchGlpiTicketDetail(ticketId: number): Promise<{ ok: boolean; ticket: GlpiTicketDetail }> {
  return fetchJson<{ ok: boolean; ticket: GlpiTicketDetail }>(`/api/value-help/glpi/${ticketId}`);
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

export type SapSystemRow = {
  id: number;
  code: string;
  description: string | null;
  environment: string;
  allow_multiple_logon: boolean;
  host: string | null;
  system_number: string | null;
  client: string | null;
  rfc_user: string | null;
  rfc_password?: string | null;
  is_active: boolean;
  created_at?: string;
};

export async function fetchSapSystems(): Promise<{ rows: SapSystemRow[] }> {
  return fetchJson("/api/admin/systems");
}

export async function createSapSystem(data: Partial<SapSystemRow>): Promise<SapSystemRow> {
  return fetchJson("/api/admin/systems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function updateSapSystem(id: number, data: Partial<SapSystemRow>): Promise<SapSystemRow> {
  return fetchJson(`/api/admin/systems/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function deleteSapSystem(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/admin/systems/${id}`, {
    method: "DELETE"
  });
}

export async function testSapSystemConnection(data: Partial<SapSystemRow>): Promise<{ ok: boolean; message: string }> {
  return fetchJson("/api/admin/systems/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
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

let cachedOutlookSettings: { limit: number; maxChars: number; timestamp: number } | null = null;

export async function searchOutlookEmail(
  subject: string,
  limit?: number,
  maxChars?: number
): Promise<{ rows: OutlookSearchEmailResult[] }> {
  let finalLimit = limit;
  let finalMaxChars = maxChars;

  if (!finalLimit || !finalMaxChars) {
    const now = Date.now();
    if (cachedOutlookSettings && now - cachedOutlookSettings.timestamp < 30000) {
      finalLimit = finalLimit || cachedOutlookSettings.limit;
      finalMaxChars = finalMaxChars || cachedOutlookSettings.maxChars;
    } else {
      try {
        const settings = await fetchAdminSettings();
        const dbLimit = parseInt(settings.outlook_max_email_count || "5", 10) || 5;
        const dbMaxChars = parseInt(settings.outlook_max_body_chars || "15000", 10) || 15000;
        cachedOutlookSettings = { limit: dbLimit, maxChars: dbMaxChars, timestamp: now };
        finalLimit = finalLimit || dbLimit;
        finalMaxChars = finalMaxChars || dbMaxChars;
      } catch {
        finalLimit = finalLimit || 5;
        finalMaxChars = finalMaxChars || 15000;
      }
    }
  }

  const queryParams = new URLSearchParams({ q: subject });
  if (finalLimit && finalLimit > 0) queryParams.set("limit", String(finalLimit));
  if (finalMaxChars && finalMaxChars > 0) queryParams.set("maxChars", String(finalMaxChars));
  const queryString = queryParams.toString();

  // 1. Try Local Client Agent on user's Windows laptop (Passwordless local MAPI)
  const agentUrls = [
    `http://127.0.0.1:18888/api/fetch-outlook?${queryString}`,
    `http://localhost:18888/api/fetch-outlook?${queryString}`
  ];

  for (const url of agentUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const localRes = await fetch(url, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      const data = await localRes.json();
      
      if (!localRes.ok) {
        if (data && data.error) {
          throw new Error(data.error); // Throw application error from Agent to UI
        }
        continue;
      }
      
      if (data && Array.isArray(data.rows)) {
        return data;
      }
    } catch (err: any) {
      if (err.message && err.message.includes("Gagal mengambil email")) {
        throw err; // Stop loop and fallback, throw directly to UI!
      }
      console.warn(`Local Agent fetch failed for ${url}:`, err);
    }
  }

  // 2. Central Server Backend Fallback
  try {
    return await fetchJson(`/api/outlook/search-email?${queryString}`);
  } catch (serverErr: any) {
    const msg = serverErr?.message || String(serverErr);
    if (msg.includes("Agent lokal Outlook belum berjalan")) {
      throw new Error(
        "Agent Outlook lokal belum terhubung atau diblokir oleh browser. Pastikan Outlook Desktop terbuka dan buka http://127.0.0.1:18888 di tab baru untuk mengaktifkan koneksi."
      );
    }
    throw serverErr;
  }
}

export type AiAnalysisResult = {
  issueName: string;
  requestDescription?: string;
  problemAnalysis: string;
  impactAnalysis: string;
  participants?: Record<string, string>;
  timeline?: Record<string, string>;
  providerUsed?: string;
};

export async function generateAnalysis(emailContext: string, emailSubject?: string, issueName?: string): Promise<AiAnalysisResult> {
  return fetchJson("/api/ai/generate-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailContext, emailSubject, issueName })
  });
}

export async function testAiConnection(params: {
  provider: "9router" | "openrouter";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<{ ok: boolean; message: string; output?: string }> {
  return fetchJson("/api/ai/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
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

export type ActivityLogItem = {
  id: number;
  created_at: string;
  activity_type: "sync" | "issue" | "project" | "master_data" | "setting" | "auth";
  action: string;
  username: string;
  user_id?: number | null;
  description: string;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
};

export type ActivityLogFilters = {
  activityType?: string;
  q?: string;
  username?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

export type ActivityLogSummary = {
  total: number;
  sync_count: number;
  issue_count: number;
  project_count: number;
  master_data_count: number;
  setting_count: number;
  auth_count: number;
};

export async function fetchAuditLogs(filters: ActivityLogFilters = {}): Promise<{
  rows: ActivityLogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: ActivityLogSummary;
}> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, String(value));
  }
  const suffix = params.toString() ? `?${params}` : "";
  return fetchJson(`/api/audit-logs${suffix}`);
}

export * from "./api/projectApi.js";

export type DocxTemplateMeta = { isCustom: boolean; exists: boolean; sizeBytes: number; updatedAt: string | null };
export type DocxTemplatesInfo = { single: DocxTemplateMeta; project: DocxTemplateMeta; user: DocxTemplateMeta };

export async function fetchDocxTemplatesInfo(): Promise<DocxTemplatesInfo> {
  return fetchJson("/api/admin/docx-templates/info");
}

export function downloadDocxTemplateUrl(type: "single" | "project" | "user"): string {
  return `/api/admin/docx-templates/${type}/download`;
}

export async function uploadDocxTemplate(type: "single" | "project" | "user", file: File): Promise<{ ok: boolean; message: string }> {
  const reader = new FileReader();
  const base64: string = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return fetchJson(`/api/admin/docx-templates/${type}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentBase64: base64, filename: file.name })
  });
}

export async function resetDocxTemplate(type: "single" | "project" | "user"): Promise<{ ok: boolean; message: string }> {
  return fetchJson(`/api/admin/docx-templates/${type}/reset`, { method: "POST" });
}

export async function downloadUserCrTemplate(issueId: number) {
  const response = await fetch(`/api/issues/${issueId}/templates/cr-user`, { credentials: "include" });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.message || "Failed to generate CR User Form document.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  let filename = `CR User Form ${issueId}.docx`;
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i);
  if (match) {
    const raw = match[1] || match[2] || match[3];
    if (raw) filename = decodeURIComponent(raw.trim());
  }
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
