import type {
  CreateManagedUserPayload,
  ManagedUser,
  ManagedUserListFilters,
  ManagedUserListResult,
  RestoreManagedUserPayload,
  UpdateManagedUserProfilePayload,
  UserAuditEntry
} from "../../shared/userManagementTypes";

export class ManagedUserApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly details: Record<string, unknown>
  ) {
    super(message);
    this.name = "ManagedUserApiError";
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new ManagedUserApiError(
      typeof body.message === "string"
        ? body.message
        : `Request failed: ${response.status}`,
      response.status,
      typeof body.code === "string" ? body.code : undefined,
      body
    );
  }
  return body as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

export async function fetchManagedUsers(
  filters: ManagedUserListFilters = {}
): Promise<ManagedUserListResult> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (filters.scope) params.set("scope", filters.scope);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const suffix = params.size ? `?${params}` : "";
  return requestJson<ManagedUserListResult>(`/api/users${suffix}`);
}

export async function fetchManagedUserAudit(userId: number): Promise<UserAuditEntry[]> {
  const body = await requestJson<{ audit: UserAuditEntry[] }>(
    `/api/users/${userId}/audit`
  );
  return body.audit;
}

export async function createManagedUser(
  payload: CreateManagedUserPayload
): Promise<ManagedUser> {
  const body = await requestJson<{ user: ManagedUser }>(
    "/api/users",
    jsonInit("POST", payload)
  );
  return body.user;
}

export async function updateManagedUserProfile(
  userId: number,
  payload: UpdateManagedUserProfilePayload
): Promise<ManagedUser> {
  const body = await requestJson<{ user: ManagedUser }>(
    `/api/users/${userId}/profile`,
    jsonInit("PATCH", payload)
  );
  return body.user;
}

export async function setManagedUserStatus(
  userId: number,
  isActive: boolean
): Promise<ManagedUser> {
  const body = await requestJson<{ user: ManagedUser }>(
    `/api/users/${userId}/status`,
    jsonInit("PATCH", { isActive })
  );
  return body.user;
}

export async function resetManagedUserPassword(
  userId: number,
  password: string
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/users/${userId}/password`,
    jsonInit("PATCH", { password })
  );
}

export async function revokeManagedUserSessions(userId: number): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/users/${userId}/revoke-sessions`,
    jsonInit("POST")
  );
}

export async function archiveManagedUser(
  userId: number,
  reason: string
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/users/${userId}`,
    jsonInit("DELETE", { reason })
  );
}

export async function restoreManagedUser(
  userId: number,
  payload: RestoreManagedUserPayload
): Promise<ManagedUser> {
  const body = await requestJson<{ user: ManagedUser }>(
    `/api/users/${userId}/restore`,
    jsonInit("POST", payload)
  );
  return body.user;
}
