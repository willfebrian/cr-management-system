import "dotenv/config";
import { config } from "../src/server/config.js";
import { pool } from "../src/server/db/pool.js";
import {
  reconcileLegacyTransportLifecycle,
  type TransportTargetSystemCode
} from "../src/server/sync/transportLifecycleReconciler.js";

const dryRun = process.argv.includes("--dry-run");
const requestedTargets = process.argv
  .filter((argument) => argument.startsWith("--target="))
  .flatMap((argument) => argument.slice("--target=".length).split(","))
  .map((value) => value.trim().toUpperCase())
  .filter((value): value is TransportTargetSystemCode => value === "QA" || value === "PRD");
const targetSystemCodes = requestedTargets.length
  ? [...new Set(requestedTargets)]
  : (["QA", "PRD"] as TransportTargetSystemCode[]);

try {
  const result = await reconcileLegacyTransportLifecycle({
    targetSystemCodes,
    limitPerTarget: Math.min(Math.max(config.orphanRecovery.maxPerSync, 1), 200),
    dryRun
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
