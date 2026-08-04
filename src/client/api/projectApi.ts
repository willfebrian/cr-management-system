import type {
  ProjectDetail,
  ProjectFilters,
  ProjectIssueOption,
  ProjectListResult,
  ProjectOwnerOption,
  ProjectCrReadiness,
  ProjectSavePayload
} from "../../shared/projectTypes.js";

export async function fetchProjects(filters: ProjectFilters = {}): Promise<ProjectListResult> {
  return fetchProjectJson(`/api/projects${queryString(filters)}`);
}

export async function fetchProjectDetail(id: number): Promise<ProjectDetail> {
  return fetchProjectJson(`/api/projects/${id}`);
}

export async function fetchProjectIssueOptions(
  q: string,
  excludeProjectId?: number
): Promise<{ rows: ProjectIssueOption[] }> {
  return fetchProjectJson(`/api/projects/issue-options${queryString({ q, excludeProjectId })}`);
}

export async function fetchProjectOwnerOptions(q = ""): Promise<{ rows: ProjectOwnerOption[] }> {
  return fetchProjectJson(`/api/projects/owner-options${queryString({ q })}`);
}

export async function saveProject(payload: ProjectSavePayload): Promise<ProjectDetail> {
  const isUpdate = Boolean(payload.id);
  return fetchProjectJson(`/api/projects${isUpdate ? `/${payload.id}` : ""}`, {
    method: isUpdate ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function cancelProject(id: number, reason: string): Promise<ProjectDetail> {
  return fetchProjectJson(`/api/projects/${id}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
}

export async function deleteProject(id: number): Promise<{ ok: true; id: number }> {
  return fetchProjectJson(`/api/projects/${id}`, { method: "DELETE" });
}

export async function fetchProjectCrTransportReadiness(id: number): Promise<ProjectCrReadiness> {
  return fetchProjectJson(`/api/projects/${id}/cr-transport-readiness`);
}

export async function downloadProjectCrTransport(id: number): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`/api/projects/${id}/cr-transport-document`, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body?.message || `Request failed: ${response.status}`) as Error & { readiness?: ProjectCrReadiness };
    error.readiness = body?.readiness;
    throw error;
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `CR Transport Project ${id}.docx`;
  return { blob: await response.blob(), filename };
}

async function fetchProjectJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Request failed: ${response.status}`);
  }
  return body as T;
}

function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
