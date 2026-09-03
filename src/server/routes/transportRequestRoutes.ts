import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAdmin } from "../auth/middleware.js";
import {
  createTransportRequest,
  preflightTransportRequest,
  resolveTransportObject,
  normalizeTargetSystem
} from "../sap/transportRequestService.js";
import { recordActivityLog } from "../db/auditRepository.js";
import { syncCreatedTransportRequest } from "../sync/crSyncRunner.js";
import { createdTransportSyncPlan } from "../sync/transportRequestSync.js";

export const transportRequestRoutes = Router();
transportRequestRoutes.use(requireAdmin);

transportRequestRoutes.post("/resolve-object", asyncHandler(async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (query.length < 3) {
    res.json({ ok: true, message: "Enter at least 3 characters to search SAP objects.", rows: [] });
    return;
  }
  res.json(await resolveTransportObject(query, req.body?.targetSystem));
}));

transportRequestRoutes.post("/preflight", asyncHandler(async (req, res) => {
  res.json(await preflightTransportRequest(req.body));
}));

transportRequestRoutes.post("/create", asyncHandler(async (req, res) => {
  const result = await createTransportRequest(req.body);
  const targetSystem = normalizeTargetSystem(req.body?.targetSystem);
  const syncPlan = createdTransportSyncPlan(targetSystem, result);
  let syncCompleted = false;
  let syncMessage: string | undefined;
  let syncedCr: Awaited<ReturnType<typeof syncCreatedTransportRequest>>["cr"] | undefined;
  await recordActivityLog({
    activityType: "admin",
    action: "create_sap_transport_request",
    username: req.authUser?.username || "system",
    userId: req.authUser?.id || null,
    description: `Created SAP transport request ${String(result.request || "")} on ${targetSystem} with ${Array.isArray(req.body?.objects) ? req.body.objects.length : 0} object(s)`,
    ipAddress: req.ip
  });
  if (syncPlan) {
    try {
      const syncResult = await syncCreatedTransportRequest(syncPlan.trkorr, syncPlan.sourceSystemCode);
      syncCompleted = true;
      syncedCr = syncResult.cr;
      await recordActivityLog({
        activityType: "admin",
        action: "sync_cr_after_transport_create",
        username: req.authUser?.username || "system",
        userId: req.authUser?.id || null,
        description: `Created transport request ${syncPlan.trkorr} was saved to the local CR database.`,
        ipAddress: req.ip
      });
    } catch (error) {
      syncMessage = error instanceof Error ? error.message : String(error);
      await recordActivityLog({
        activityType: "admin",
        action: "sync_cr_after_transport_create_failed",
        username: req.authUser?.username || "system",
        userId: req.authUser?.id || null,
        description: `Created transport request ${syncPlan.trkorr} could not be saved to the local CR database: ${syncMessage}`,
        ipAddress: req.ip
      });
    }
  }
  res.status(201).json({ ...result, targetSystem, syncQueued: false, syncCompleted, syncMessage, cr: syncedCr });
}));

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: Error & { status?: number; code?: string }) => {
      if (error.status) return res.status(error.status).json({ ok: false, message: error.message, code: error.code });
      next(error);
    });
  };
}
