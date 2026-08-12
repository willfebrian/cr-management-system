export type ReleaseTaskResult = {
  trkorr: string;
  trfunction: string;
  description: string;
  status: "PASS" | "ERROR" | "WARNING" | "RELEASED" | "SKIPPED";
  message: string;
  sequence: number;
  objects: ReleaseObjectResult[];
};

export type ReleaseObjectResult = {
  trkorr: string;
  pgmid: string;
  objectType: string;
  objectName: string;
  status: "PASS" | "ERROR" | "WARNING" | "RELEASED" | "SKIPPED";
  message: string;
  sequence: number;
  statusSource: "SAP" | "TASK";
};

export type ReleaseResult = {
  ok: boolean;
  message: string;
  mode: string;
  trkorr: string;
  targetSystem: string;
  targetServer: string;
  hasErrors: boolean;
  hasWarnings: boolean;
  tasks: ReleaseTaskResult[];
};

export type ReleaseCandidateRow = {
  trkorr: string;
  description: string;
  owner: string;
  statusGroup: string;
  changedDate: string | null;
  targetSystem: string | null;
  taskCount: number;
};

export type ReleaseCandidatesResult = {
  ok: boolean;
  targetSystem: string;
  lastSyncedAt: string | null;
  rows: ReleaseCandidateRow[];
};

export async function fetchReleaseCandidates(targetSystem = "DEV_AIX", limit = 50, query = ""): Promise<ReleaseCandidatesResult> {
  const search = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
  return request(`/api/cr-transports/release/candidates?targetSystem=${encodeURIComponent(targetSystem)}&limit=${limit}${search}`, undefined, "GET");
}

export async function testRunRelease(trkorr: string, targetSystem = "DEV_AIX"): Promise<ReleaseResult> {
  return request("/api/cr-transports/release/test-run", { trkorr, targetSystem });
}

export async function executeRelease(trkorr: string, targetSystem = "DEV_AIX"): Promise<ReleaseResult> {
  return request("/api/cr-transports/release/execute", { trkorr, targetSystem });
}

async function request<T>(url: string, body: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const options: RequestInit = {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    };
    if (method === "POST" && body !== undefined) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload as T;

    const message = String(payload.message || `Request failed: ${response.status}`);
    if (isTransientConnectionError(message) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    if (isTransientConnectionError(message)) {
      throw new Error("The database is temporarily unavailable. Please try again.");
    }
    throw new Error(message);
  }
  throw new Error("Request failed");
}

function isTransientConnectionError(message: string) {
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|connection terminated unexpectedly|57P01/i.test(message);
}
