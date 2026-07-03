import {
  createSyncRun,
  finishSyncRun,
  getCachedCrRefreshSignature,
  getLastSuccessfulSyncRun,
  hasDevParentCr,
  insertCrStatusSnapshot,
  markOrphanTransportRecoveryFailed,
  refreshTransportLifecycleFromCache,
  replaceCrObjects,
  upsertConfirmedTransportLogs,
  upsertCrCreationLogs,
  upsertCrHeader
} from "../db/crRepository.js";
import { config, getSapCrSystem } from "../config.js";
import { readCrCreationLogs, readCrDetail, readCrList, readTransportImportLogs } from "../sap/crExtractor.js";

export type SyncMode = "incremental" | "full_period";

export type SyncPeriod = {
  periodType: string;
  periodValue: number | null;
  fromDate: string;
  toDate: string;
};

export type RunCrSyncOptions = {
  systemCodes: string[];
  owner?: string;
  fromDate?: string;
  toDate?: string;
  rowCount?: number;
  syncMode?: SyncMode;
  lookbackDays?: number;
};

export type RunCrSyncResult = {
  ok: boolean;
  requestCount: number;
  results: Array<{
    systemCode: string;
    syncRunId: number;
    status: "success" | "failed";
    requestCount: number;
    summary?: Record<string, number>;
    period: SyncPeriod;
    message?: string;
  }>;
  lifecycleResults: Array<{
    targetSystemCode: string;
    evidenceSource: "confirmed" | "inferred";
    logCount?: number;
    orphanImportsFound?: number;
    orphanImportsRecovered?: number;
    orphanImportsFailed?: number;
    message?: string;
    period?: SyncPeriod;
  }>;
  orphanImportsFound: number;
  orphanImportsRecovered: number;
  orphanImportsFailed: number;
};

export async function runCrSync(options: RunCrSyncOptions): Promise<RunCrSyncResult> {
  const systemCodes = normalizeSystemCodes(options.systemCodes);
  const rowCount = Number(options.rowCount || 5000);
  const syncMode = normalizeSyncMode(options.syncMode);
  const lookbackDays = normalizeLookbackDays(options.lookbackDays);
  const explicitPeriod = resolveFullPeriod({
    fromDate: options.fromDate,
    toDate: options.toDate
  });
  const periodsBySystem = new Map<string, SyncPeriod>();
  const results: RunCrSyncResult["results"] = [];
  let requestCount = 0;

  for (const systemCode of systemCodes) {
    const system = getSapCrSystem(systemCode);
    const owner = String(options.owner || system.owner).toUpperCase();
    const period = syncMode === "incremental"
      ? await resolveIncrementalPeriod(system.code, lookbackDays)
      : explicitPeriod;
    periodsBySystem.set(system.code, period);
    const syncRunId = await createSyncRun({
      scopeOwner: owner,
      sapSystemCode: system.code,
      periodType: period.periodType,
      periodValue: period.periodValue,
      fromDate: period.fromDate,
      toDate: period.toDate,
      maxRows: rowCount,
      syncMode,
      lookbackDays: syncMode === "incremental" ? lookbackDays : null
    });

    try {
      const list = await readCrList({
        systemCode: system.code,
        owner,
        fromDate: period.fromDate,
        toDate: period.toDate,
        rowCount
      });

      const scopedParentRequests = list.requests.filter((request) => isScopedParentRequest(request, owner));
      let systemRequestCount = 0;
      for (const request of scopedParentRequests) {
        await upsertCrHeader(request, system.code, syncRunId);
        await insertCrStatusSnapshot(request, system.code, syncRunId);
        systemRequestCount += 1;
        requestCount += 1;
      }

      if (system.code === "DEV") {
        const creationLogs = await readCrCreationLogs({
          systemCode: system.code,
          owner,
          fromDate: period.fromDate,
          toDate: period.toDate,
          rowCount
        });
        await upsertCrCreationLogs(system.code, creationLogs);
      }

      for (const request of scopedParentRequests) {
        const signature = await getCachedCrRefreshSignature(system.code, request.trkorr);
        if (signature && !shouldRefreshDetail(signature, request)) {
          continue;
        }
        const detail = await readCrDetail(request.trkorr, system.code);
        if (!isScopedParentRequest(detail.header, owner)) {
          continue;
        }
        if (detail.header) {
          await upsertCrHeader(detail.header, system.code, syncRunId);
          await insertCrStatusSnapshot(detail.header, system.code, syncRunId);
        }
        for (const task of detail.tasks) {
          await upsertCrHeader(task, system.code, syncRunId);
          await insertCrStatusSnapshot(task, system.code, syncRunId);
        }
        await replaceCrObjects(detail, system.code);
      }

      await finishSyncRun(syncRunId, "success", null, systemRequestCount);
      results.push({
        systemCode: system.code,
        syncRunId,
        status: "success",
        requestCount: systemRequestCount,
        summary: list.summary,
        period
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishSyncRun(syncRunId, "failed", message, 0).catch(() => undefined);
      results.push({
        systemCode: system.code,
        syncRunId,
        status: "failed",
        requestCount: 0,
        period,
        message
      });
    }
  }

  const lifecycleResults: RunCrSyncResult["lifecycleResults"] = [];
  let orphanImportsFound = 0;
  let orphanImportsRecovered = 0;
  let orphanImportsFailed = 0;
  for (const targetSystemCode of ["QA", "PRD"]) {
    if (!systemCodes.includes(targetSystemCode)) continue;
    const period = periodsBySystem.get(targetSystemCode) || explicitPeriod;
    try {
      const logs = await readTransportImportLogs({
        targetSystemCode,
        fromDate: period.fromDate,
        toDate: period.toDate,
        rowCount
      });
      const lifecycleUpsert = await upsertConfirmedTransportLogs(targetSystemCode, logs);
      const recovery = await recoverOrphanImports({
        targetSystemCode,
        logs: lifecycleUpsert.orphanLogs,
        period,
        rowCount
      });
      if (recovery.recoveredLogs.length) {
        await upsertConfirmedTransportLogs(targetSystemCode, recovery.recoveredLogs);
      }
      orphanImportsFound += lifecycleUpsert.orphanLogs.length;
      orphanImportsRecovered += recovery.recovered;
      orphanImportsFailed += recovery.failed;
      lifecycleResults.push({
        targetSystemCode,
        evidenceSource: "confirmed",
        logCount: logs.length,
        orphanImportsFound: lifecycleUpsert.orphanLogs.length,
        orphanImportsRecovered: recovery.recovered,
        orphanImportsFailed: recovery.failed,
        period
      });
    } catch (error) {
      lifecycleResults.push({
        targetSystemCode,
        evidenceSource: "inferred",
        period,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await refreshTransportLifecycleFromCache("DEV");

  return {
    ok: results.some((result) => result.status === "success"),
    requestCount,
    results,
    lifecycleResults,
    orphanImportsFound,
    orphanImportsRecovered,
    orphanImportsFailed
  };
}

export function normalizeSystemCodes(value: unknown) {
  const raw = Array.isArray(value) ? value : [value || "DEV"];
  return raw.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean);
}

export function normalizeSyncMode(value: unknown): SyncMode {
  return String(value || "incremental").toLowerCase() === "full_period" ? "full_period" : "incremental";
}

export function normalizeLookbackDays(value: unknown) {
  return Math.min(Math.max(Number(value || 3), 0), 30);
}

export function resolveFullPeriod({ fromDate, toDate }: { fromDate?: unknown; toDate?: unknown }): SyncPeriod {
  const now = new Date();
  const startOfYear = `${now.getFullYear()}-01-01`;
  const normalizedFrom = typeof fromDate === "string" && fromDate ? fromDate : startOfYear;
  const normalizedTo = typeof toDate === "string" && toDate ? toDate : ymd(now);

  if (normalizedFrom > normalizedTo) {
    throw new Error("Sync date from must be before or equal to date to.");
  }

  return {
    periodType: "date_range",
    periodValue: null,
    fromDate: normalizedFrom,
    toDate: normalizedTo
  };
}

async function resolveIncrementalPeriod(systemCode: string, lookbackDays: number): Promise<SyncPeriod> {
  const now = new Date();
  const lastSync = await getLastSuccessfulSyncRun(systemCode);
  const from = lastSync?.finished_at ? new Date(lastSync.finished_at) : new Date(now.getFullYear(), 0, 1);
  if (lastSync?.finished_at) from.setDate(from.getDate() - lookbackDays);
  return {
    periodType: "incremental",
    periodValue: lookbackDays,
    fromDate: ymd(from),
    toDate: ymd(now)
  };
}

function ymd(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function recoverOrphanImports({
  targetSystemCode,
  logs,
  period,
  rowCount
}: {
  targetSystemCode: string;
  logs: Awaited<ReturnType<typeof upsertConfirmedTransportLogs>>["orphanLogs"];
  period: SyncPeriod;
  rowCount: number;
}) {
  if (!config.orphanRecovery.enabled || config.orphanRecovery.maxPerSync <= 0) {
    return { recovered: 0, failed: 0, recoveredLogs: [] };
  }

  const owner = getSapCrSystem("DEV").owner;
  const limitedLogs = dedupeByTrkorr(logs).slice(0, config.orphanRecovery.maxPerSync);
  if (!limitedLogs.length) return { recovered: 0, failed: 0, recoveredLogs: [] };

  const syncRunId = await createSyncRun({
    scopeOwner: owner,
    sapSystemCode: "DEV",
    periodType: "orphan_recovery",
    periodValue: limitedLogs.length,
    fromDate: period.fromDate,
    toDate: period.toDate,
    maxRows: rowCount,
    syncMode: "incremental",
    lookbackDays: null
  });

  let recovered = 0;
  let failed = 0;
  const recoveredLogs = [];
  try {
    for (const log of limitedLogs) {
      try {
        if (!(await hasDevParentCr(log.trkorr))) {
          const detail = await readCrDetail(log.trkorr, "DEV");
          if (!detail.header) throw new Error("DEV parent CR detail was not returned by SAP.");
          if (String(detail.header.owner || "").toUpperCase() !== owner) {
            throw new Error(`Skipped because DEV owner is ${detail.header.owner || "<empty>"}, not ${owner}.`);
          }
          await upsertCrHeader(detail.header, "DEV", syncRunId);
          await insertCrStatusSnapshot(detail.header, "DEV", syncRunId);
          for (const task of detail.tasks) {
            await upsertCrHeader(task, "DEV", syncRunId);
            await insertCrStatusSnapshot(task, "DEV", syncRunId);
          }
          await replaceCrObjects(detail, "DEV");
        }
        recovered += 1;
        recoveredLogs.push(log);
      } catch (error) {
        failed += 1;
        await markOrphanTransportRecoveryFailed(
          targetSystemCode,
          log.trkorr,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    await finishSyncRun(
      syncRunId,
      "success",
      failed ? `${recovered} orphan import(s) recovered; ${failed} skipped or failed.` : null,
      recovered
    );
  } catch (error) {
    await finishSyncRun(syncRunId, "failed", error instanceof Error ? error.message : String(error), recovered).catch(() => undefined);
    throw error;
  }

  return { recovered, failed, recoveredLogs };
}

function dedupeByTrkorr<T extends { trkorr: string }>(rows: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (!row.trkorr || seen.has(row.trkorr)) continue;
    seen.add(row.trkorr);
    result.push(row);
  }
  return result;
}

function isScopedParentRequest(
  request:
    | {
        parentRequest?: string | null;
        owner?: string | null;
      }
    | null
    | undefined,
  owner: string
) {
  return Boolean(
    request &&
      !request.parentRequest &&
      String(request.owner || "").trim().toUpperCase() === owner
  );
}

function shouldRefreshDetail(
  signature: {
    status_code?: string | null;
    status_group?: string | null;
    changed_date?: string | null;
    changed_time?: string | null;
    task_count?: number | string | null;
    object_count?: number | string | null;
  },
  request: {
    status?: string;
    statusGroup?: string;
    changedDate?: string;
    changedTime?: string;
  }
) {
  if (!Number(signature.object_count || 0)) return true;
  if (String(signature.status_code || "") !== String(request.status || "")) return true;
  if (String(signature.status_group || "") !== String(request.statusGroup || "")) return true;
  if (String(signature.changed_date || "") !== String(request.changedDate || "")) return true;
  if (normalizeSapTime(signature.changed_time) !== normalizeSapTime(request.changedTime)) return true;
  return false;
}

function normalizeSapTime(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(6, "0").slice(-6) : "";
}
