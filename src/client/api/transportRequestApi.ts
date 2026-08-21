import type { TransportTargetSystem } from "../components/crTransport/transportTarget.js";

export type ResolvedTransportObject = {
  pgmid: string;
  objectType: string;
  objectName: string;
  sourcePackage: string;
  targetPackage: "ZTRD";
  locked: boolean;
  lockOrder: string;
  lockUser: string;
};

export type TransportRequestResult = {
  ok: boolean;
  phase?: string;
  message: string;
  request?: string;
  task?: string;
  targetSystem?: string;
  targetServer?: string;
  syncQueued?: boolean;
  syncCompleted?: boolean;
  syncMessage?: string;
};

export async function resolveTransportObject(query: string, targetSystem: TransportTargetSystem = "DEV_NC"): Promise<{ ok: boolean; message: string; rows: ResolvedTransportObject[] }> {
  return request("/api/cr-transports/resolve-object", { query, targetSystem }, { retryTransient: true });
}

export async function preflightTransportRequest(description: string, objects: ResolvedTransportObject[], targetSystem: TransportTargetSystem = "DEV_NC"): Promise<TransportRequestResult> {
  return request("/api/cr-transports/preflight", { description, objects, targetSystem });
}

export async function createTransportRequest(description: string, objects: ResolvedTransportObject[], targetSystem: TransportTargetSystem = "DEV_NC"): Promise<TransportRequestResult> {
  return request("/api/cr-transports/create", { description, objects, targetSystem, confirmed: true });
}

async function request<T>(url: string, body: unknown, options: { retryTransient?: boolean } = {}): Promise<T> {
  const maxAttempts = options.retryTransient ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload as T;

    const message = String(payload.message || `Request failed: ${response.status}`);
    if (isTransientConnectionError(message) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    if (isTransientConnectionError(message)) {
      throw new Error("Database sementara tidak dapat dihubungi. Silakan coba kembali.");
    }
    throw new Error(message);
  }
  throw new Error("Request failed");
}

function isTransientConnectionError(message: string) {
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|connection terminated unexpectedly|57P01/i.test(message);
}
