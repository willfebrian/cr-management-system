import { config } from "../config.js";

export function shouldQueueTransportCreateSync(targetSystem: string, result: { ok?: boolean; request?: unknown; trkorr?: unknown }) {
  const requestId = result?.request ?? result?.trkorr;
  return ["DEV_AIX", "TRD"].includes(String(targetSystem || "").trim().toUpperCase())
    && result?.ok === true
    && Boolean(String(requestId || "").trim());
}

export function createdTransportSyncPlan(targetSystem: string, result: { ok?: boolean; request?: unknown; trkorr?: unknown }) {
  const trkorr = String(result?.request ?? result?.trkorr ?? "").trim().toUpperCase();
  const target = String(targetSystem || "").trim().toUpperCase();
  if (result?.ok !== true || !trkorr) {
    return null;
  }
  if (target === "DEV_AIX" || target === "TRD") return { sourceSystemCode: "DEV", trkorr };
  if (target === "DEV_NC") return { sourceSystemCode: "DEV_NC", trkorr };
  return null;
}

export function transportCreateSyncOptions() {
  return {
    systemCodes: ["DEV", "QA", "PRD"],
    syncMode: "incremental" as const,
    lookbackDays: 3,
    rowCount: config.autoSync.rowCount
  };
}
