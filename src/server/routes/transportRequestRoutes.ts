import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAdmin } from "../auth/middleware.js";
import {
  createTransportRequest,
  preflightTransportRequest,
  resolveTransportObject,
  normalizeTargetSystem
} from "../sap/transportRequestService.js";
import { recordActivityLog } from "../db/auditRepository.js";
import { runCrSync } from "../sync/crSyncRunner.js";
import { shouldQueueTransportCreateSync, transportCreateSyncOptions } from "../sync/transportRequestSync.js";

export const transportRequestRoutes = Router();
transportRequestRoutes.use(requireAdmin);

transportRequestRoutes.post("/resolve-object", asyncHandler(async (req, res) => {
  res.json(await resolveTransportObject(String(req.body?.query || ""), req.body?.targetSystem));
}));

transportRequestRoutes.post("/preflight", asyncHandler(async (req, res) => {
  res.json(await preflightTransportRequest(req.body));
}));

transportRequestRoutes.post("/create", asyncHandler(async (req, res) => {
  const result = await createTransportRequest(req.body);
  const targetSystem = normalizeTargetSystem(req.body?.targetSystem);
  const syncQueued = shouldQueueTransportCreateSync(targetSystem, result);
  await recordActivityLog({
    activityType: "admin",
    action: "create_sap_transport_request",
    username: req.authUser?.username || "system",
    userId: req.authUser?.id || null,
    description: `Created SAP transport request ${String(result.request || "")} on ${targetSystem} with ${Array.isArray(req.body?.objects) ? req.body.objects.length : 0} object(s)`,
    ipAddress: req.ip
  });
  if (syncQueued) {
    void runCrSync(transportCreateSyncOptions())
      .then((syncResult) => recordActivityLog({
        activityType: "admin",
        action: "sync_cr_after_transport_create",
        username: req.authUser?.username || "system",
        userId: req.authUser?.id || null,
        description: `Automatic CR sync completed after DEV AIX request ${String(result.request || "")}: ${syncResult.requestCount} request(s)`,
        ipAddress: req.ip
      }))
      .catch((error) => recordActivityLog({
        activityType: "admin",
        action: "sync_cr_after_transport_create_failed",
        username: req.authUser?.username || "system",
        userId: req.authUser?.id || null,
        description: `Automatic CR sync failed after DEV AIX request ${String(result.request || "")}: ${String(error?.message || error)}`,
        ipAddress: req.ip
      }));
  }
  res.status(201).json({ ...result, targetSystem, syncQueued });
}));

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: Error & { status?: number; code?: string }) => {
      if (error.status) return res.status(error.status).json({ ok: false, message: error.message, code: error.code });
      next(error);
    });
  };
}
