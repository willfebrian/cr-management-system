import { config } from "../config.js";
import { assertDatabaseConfigured } from "../db/pool.js";
import { getLastSuccessfulSyncRun } from "../db/crRepository.js";
import { runCrSync } from "./crSyncRunner.js";
import { recordActivityLog } from "../db/auditRepository.js";

let running = false;

export function startCrAutoSyncScheduler() {
  if (!config.autoSync.enabled) {
    console.log("CR auto sync scheduler is disabled.");
    return;
  }

  const intervals = config.autoSync.systemCodes.map((systemCode) =>
    resolveSystemIntervalMinutes(
      systemCode,
      config.autoSync.intervalMinutes,
      config.autoSync.intervalMinutesBySystem
    )
  );
  const schedulerIntervalMinutes = Math.min(...intervals);
  const intervalMs = schedulerIntervalMinutes * 60 * 1000;
  const scheduleDescription = config.autoSync.systemCodes
    .map((systemCode) => `${systemCode}=${resolveSystemIntervalMinutes(systemCode, config.autoSync.intervalMinutes, config.autoSync.intervalMinutesBySystem)}m`)
    .join(", ");
  console.log(
    `CR auto sync scheduler enabled: ${scheduleDescription}; scheduler check every ${schedulerIntervalMinutes} minute(s).`
  );

  const run = async () => {
    if (running) {
      console.log("CR auto sync skipped because a previous sync is still running.");
      return;
    }
    running = true;
    try {
      await assertDatabaseConfigured();
      const dueSystems = await findDueAutoSyncSystems({
        systemCodes: config.autoSync.systemCodes,
        defaultIntervalMinutes: config.autoSync.intervalMinutes,
        intervalMinutesBySystem: config.autoSync.intervalMinutesBySystem,
        nowMs: Date.now(),
        getLastSuccessfulAt: async (systemCode) => {
          const lastSync = await getLastSuccessfulSyncRun(systemCode);
          return lastSync?.finished_at || null;
        }
      });
      if (!dueSystems.length) {
        console.log("CR auto sync skipped because no configured system is due.");
        return;
      }

      const result = await runCrSync({
        systemCodes: dueSystems,
        syncMode: "incremental",
        lookbackDays: config.autoSync.lookbackDays,
        rowCount: config.autoSync.rowCount
      });
      await recordActivityLog({
        activityType: "sync",
        action: "auto_sync_cr",
        username: "SYSTEM_SCHEDULER",
        description: `Auto-scheduled SAP CR sync for systems [${dueSystems.join(", ")}] (Result: ${result.ok ? "Success" : "Failed"}, Requests: ${result.requestCount || 0})`,
        metadata: { ok: result.ok, requestCount: result.requestCount, systems: dueSystems }
      });
      console.log(`CR auto sync finished: ${result.requestCount} request(s), ok=${result.ok}.`);
    } catch (error) {
      console.error("CR auto sync failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  unrefTimer(setInterval(run, intervalMs));
  windowlessDelay(run, 5000);
}

export function resolveSystemIntervalMinutes(
  systemCode: string,
  defaultIntervalMinutes: number,
  intervalMinutesBySystem: Record<string, number>
) {
  const configured = Number(intervalMinutesBySystem[systemCode] ?? defaultIntervalMinutes);
  return Number.isFinite(configured) ? Math.max(configured, 5) : Math.max(defaultIntervalMinutes, 5);
}

export async function findDueAutoSyncSystems(options: {
  systemCodes: string[];
  defaultIntervalMinutes: number;
  intervalMinutesBySystem: Record<string, number>;
  nowMs: number;
  getLastSuccessfulAt: (systemCode: string) => Promise<string | Date | null>;
}) {
  const dueSystems: string[] = [];
  for (const systemCode of options.systemCodes) {
    const lastSuccessfulAt = await options.getLastSuccessfulAt(systemCode);
    const lastSuccessfulMs = lastSuccessfulAt ? new Date(lastSuccessfulAt).getTime() : 0;
    const intervalMinutes = resolveSystemIntervalMinutes(
      systemCode,
      options.defaultIntervalMinutes,
      options.intervalMinutesBySystem
    );
    if (!lastSuccessfulMs || options.nowMs - lastSuccessfulMs >= intervalMinutes * 60 * 1000) {
      dueSystems.push(systemCode);
    }
  }
  return dueSystems;
}

function windowlessDelay(callback: () => void | Promise<void>, ms: number) {
  const timer = setTimeout(() => {
    void callback();
  }, ms);
  unrefTimer(timer);
}

function unrefTimer(timer: ReturnType<typeof setTimeout>) {
  if (typeof timer === "object" && timer && "unref" in timer) {
    const unref = (timer as { unref?: () => void }).unref;
    if (typeof unref === "function") unref.call(timer);
  }
}
