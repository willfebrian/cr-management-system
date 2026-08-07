import { config } from "../config.js";

export function shouldQueueTransportCreateSync(targetSystem: string, result: { ok?: boolean; request?: unknown }) {
  return String(targetSystem || "").trim().toUpperCase() === "DEV_AIX"
    && result?.ok === true
    && Boolean(String(result?.request || "").trim());
}

export function transportCreateSyncOptions() {
  return {
    systemCodes: ["DEV", "QA", "PRD"],
    syncMode: "incremental" as const,
    lookbackDays: 3,
    rowCount: config.autoSync.rowCount
  };
}
