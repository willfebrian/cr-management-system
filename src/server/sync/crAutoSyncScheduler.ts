import { config } from "../config.js";
import { assertDatabaseConfigured } from "../db/pool.js";
import { getLastSuccessfulSyncRun } from "../db/crRepository.js";
import { runCrSync } from "./crSyncRunner.js";

let running = false;

export function startCrAutoSyncScheduler() {
  if (!config.autoSync.enabled) {
    console.log("CR auto sync scheduler is disabled.");
    return;
  }

  const intervalMs = config.autoSync.intervalMinutes * 60 * 1000;
  console.log(
    `CR auto sync scheduler enabled: every ${config.autoSync.intervalMinutes} minute(s), stale after ${config.autoSync.staleHours} hour(s), systems ${config.autoSync.systemCodes.join(", ")}.`
  );

  const run = async () => {
    if (running) {
      console.log("CR auto sync skipped because a previous sync is still running.");
      return;
    }
    running = true;
    try {
      await assertDatabaseConfigured();
      const staleSystems = await getStaleSystems();
      if (!staleSystems.length) {
        console.log("CR auto sync skipped because all configured systems are still fresh.");
        return;
      }
      const result = await runCrSync({
        systemCodes: staleSystems,
        syncMode: "incremental",
        lookbackDays: config.autoSync.lookbackDays,
        rowCount: config.autoSync.rowCount
      });
      console.log(`CR auto sync finished: ${result.requestCount} request(s), ok=${result.ok}.`);
    } catch (error) {
      console.error("CR auto sync failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  setInterval(run, intervalMs);
  windowlessDelay(run, 5000);
}

async function getStaleSystems() {
  const staleAfterMs = config.autoSync.staleHours * 60 * 60 * 1000;
  const now = Date.now();
  const staleSystems: string[] = [];
  for (const systemCode of config.autoSync.systemCodes) {
    const lastSync = await getLastSuccessfulSyncRun(systemCode);
    const lastSyncTime = lastSync?.finished_at ? new Date(lastSync.finished_at).getTime() : 0;
    if (!lastSyncTime || now - lastSyncTime >= staleAfterMs) {
      staleSystems.push(systemCode);
    }
  }
  return staleSystems;
}

function windowlessDelay(callback: () => void | Promise<void>, ms: number) {
  setTimeout(() => {
    void callback();
  }, ms);
}
