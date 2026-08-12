import { config } from "../config.js";

export function shouldQueueTransportCreateSync(targetSystem: string, result: { ok?: boolean; request?: unknown; trkorr?: unknown }) {
  const requestId = result?.request ?? result?.trkorr;
  return String(targetSystem || "").trim().toUpperCase() === "DEV_AIX"
    && result?.ok === true
    && Boolean(String(requestId || "").trim());
}

export function transportCreateSyncOptions() {
  return {
    systemCodes: ["DEV", "QA", "PRD"],
    syncMode: "incremental" as const,
    lookbackDays: 3,
    rowCount: config.autoSync.rowCount
  };
}
