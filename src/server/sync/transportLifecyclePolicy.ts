import type { TransportImportLog } from "../sap/crExtractor.js";

export function normalizeTransportStep(step?: string) {
  return String(step || "").trim().toUpperCase();
}

export function isConfirmedImportLog(log: TransportImportLog) {
  return isTransportRequestId(log.trkorr) && normalizeTransportStep(log.step) === "I";
}

export function dedupeLatestConfirmedImportLogs(logs: TransportImportLog[]) {
  const normalized = logs.map(normalizeTransportLog);
  const rejected = normalized.filter((log) => !isConfirmedImportLog(log));
  const grouped = new Map<string, TransportImportLog[]>();

  for (const log of normalized.filter(isConfirmedImportLog)) {
    grouped.set(log.trkorr, [...(grouped.get(log.trkorr) || []), log]);
  }

  const accepted = [...grouped.values()]
    .map(latestTransportLog)
    .filter(Boolean) as TransportImportLog[];

  return { accepted, rejected };
}

function normalizeTransportLog(log: TransportImportLog): TransportImportLog {
  return {
    ...log,
    trkorr: String(log.trkorr || "").trim().toUpperCase(),
    step: normalizeTransportStep(log.step)
  };
}

function latestTransportLog(logs: TransportImportLog[]) {
  const successful = logs.filter(isSuccessfulImportAttempt);
  const candidates = successful.length ? successful : logs;
  return candidates.reduce<TransportImportLog | null>((latest, log) => {
    if (!latest || String(log.timestamp || "") >= String(latest.timestamp || "")) return log;
    return latest;
  }, null);
}

function isSuccessfulImportAttempt(log: TransportImportLog) {
  const returnCode = Number(log.returnCode);
  return !Number.isFinite(returnCode) || returnCode <= 4;
}

function isTransportRequestId(value?: string) {
  return /^[A-Z0-9]{3}K\d{6}$/i.test(String(value || "").trim());
}
