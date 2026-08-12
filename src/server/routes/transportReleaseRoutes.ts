import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAdmin } from "../auth/middleware.js";
import { testRunRelease, executeRelease } from "../sap/transportReleaseService.js";
import { normalizeTargetSystem } from "../sap/transportRequestService.js";
import { recordActivityLog } from "../db/auditRepository.js";
import { getLastSuccessfulSyncRun } from "../db/crRepository.js";
import { pool } from "../db/pool.js";
import { runCrSync } from "../sync/crSyncRunner.js";
import { shouldQueueTransportCreateSync, transportCreateSyncOptions } from "../sync/transportRequestSync.js";

export const transportReleaseRoutes = Router();
transportReleaseRoutes.use(requireAdmin);

/**
 * GET /api/cr-transports/release/candidates
 * Returns modifiable parent requests from the local database that are eligible for release.
 */
transportReleaseRoutes.get("/candidates", asyncHandler(async (req, res) => {
  const targetSystem = normalizeTargetSystem(req.query.targetSystem as string || "DEV_AIX");
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const snapshot = await loadReleaseCandidateSnapshot(targetSystem, limit);

  res.json({ ok: true, ...snapshot });
}));

type ReleaseCandidateDependencies = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;
  getLastSuccessfulSyncRun: (sourceSystem: string) => Promise<any>;
};

const releaseCandidateDependencies: ReleaseCandidateDependencies = {
  query: (sql, params) => pool.query(sql, params),
  getLastSuccessfulSyncRun
};

export async function loadReleaseCandidateSnapshot(
  targetSystem: string,
  limit: number,
  dependencies: ReleaseCandidateDependencies = releaseCandidateDependencies
) {
  const normalizedTargetSystem = normalizeTargetSystem(targetSystem);
  const sourceSystem = releaseCandidateSourceSystem(normalizedTargetSystem);
  const [result, lastSync] = await Promise.all([
    dependencies.query(
    `SELECT cr.trkorr, cr.description, cr.owner, cr.status_group,
            cr.changed_date, cr.target_system,
            (SELECT COUNT(*) FROM cr_management.cr_requests child
             WHERE child.parent_request = cr.trkorr
               AND child.sap_system_code = cr.sap_system_code) AS task_count
     FROM cr_management.cr_requests cr
     WHERE cr.status_group = 'outstanding'
       AND cr.parent_request IS NULL
       AND cr.sap_system_code = $1
     ORDER BY cr.changed_date DESC NULLS LAST, cr.trkorr DESC
     LIMIT $2`,
    [sourceSystem, limit]
    ),
    dependencies.getLastSuccessfulSyncRun(sourceSystem)
  ]);

  return {
    targetSystem: normalizedTargetSystem,
    lastSyncedAt: lastSync?.finished_at || lastSync?.started_at || null,
    rows: result.rows.map((row) => ({
      trkorr: row.trkorr,
      description: row.description,
      owner: row.owner,
      statusGroup: row.status_group,
      changedDate: row.changed_date,
      targetSystem: row.target_system,
      taskCount: Number(row.task_count) || 0
    }))
  };
}

export function releaseCandidateSourceSystem(targetSystem: string) {
  const normalized = normalizeTargetSystem(targetSystem);
  return normalized === "TRD" || normalized.replace("_", " ").includes("AIX")
    ? "DEV"
    : normalized;
}

/**
 * POST /api/cr-transports/release/test-run
 * Runs a test-run check on a transport request via SAP RFC.
 */
transportReleaseRoutes.post("/test-run", asyncHandler(async (req, res) => {
  const trkorr = String(req.body?.trkorr || "").trim().toUpperCase();
  if (!trkorr) {
    res.status(400).json({ ok: false, message: "trkorr is required." });
    return;
  }
  const targetSystem = normalizeTargetSystem(req.body?.targetSystem || "DEV_AIX");
  const result = await testRunRelease(trkorr, targetSystem);
  res.json(result);
}));

/**
 * POST /api/cr-transports/release/execute
 * Releases a transport request (children first, then parent).
 */
transportReleaseRoutes.post("/execute", asyncHandler(async (req, res) => {
  const trkorr = String(req.body?.trkorr || "").trim().toUpperCase();
  if (!trkorr) {
    res.status(400).json({ ok: false, message: "trkorr is required." });
    return;
  }
  const targetSystem = normalizeTargetSystem(req.body?.targetSystem || "DEV_AIX");
  const result = await executeRelease(trkorr, targetSystem);

  await recordActivityLog({
    activityType: "admin",
    action: "release_sap_transport_request",
    username: req.authUser?.username || "system",
    userId: req.authUser?.id || null,
    description: `Released SAP transport request ${trkorr} on ${targetSystem}: ${result.message}`,
    ipAddress: req.ip
  });

  // Queue a sync after successful release to update local database
  if (result.ok) {
    const syncQueued = shouldQueueTransportCreateSync(targetSystem, result as unknown as Record<string, unknown>);
    if (syncQueued) {
      void runCrSync(transportCreateSyncOptions())
        .then((syncResult) => recordActivityLog({
          activityType: "admin",
          action: "sync_cr_after_transport_release",
          username: req.authUser?.username || "system",
          userId: req.authUser?.id || null,
          description: `Auto sync after release ${trkorr}: ${syncResult.requestCount} request(s)`,
          ipAddress: req.ip
        }))
        .catch(() => {});
    }
  }

  res.status(result.ok ? 200 : 409).json(result);
}));

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: Error & { status?: number; code?: string }) => {
      if (error.status) return res.status(error.status).json({ ok: false, message: error.message, code: error.code });
      next(error);
    });
  };
}
