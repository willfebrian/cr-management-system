import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAdmin } from "../auth/middleware.js";
import {
  createTransportRequest,
  preflightTransportRequest,
  resolveTransportObject
} from "../sap/transportRequestService.js";
import { recordActivityLog } from "../db/auditRepository.js";

export const transportRequestRoutes = Router();
transportRequestRoutes.use(requireAdmin);

transportRequestRoutes.post("/resolve-object", asyncHandler(async (req, res) => {
  res.json(await resolveTransportObject(String(req.body?.query || "")));
}));

transportRequestRoutes.post("/preflight", asyncHandler(async (req, res) => {
  res.json(await preflightTransportRequest(req.body));
}));

transportRequestRoutes.post("/create", asyncHandler(async (req, res) => {
  const result = await createTransportRequest(req.body);
  await recordActivityLog({
    activityType: "admin",
    action: "create_sap_transport_request",
    username: req.authUser?.username || "system",
    userId: req.authUser?.id || null,
    description: `Created SAP transport request ${String(result.request || "")} with ${Array.isArray(req.body?.objects) ? req.body.objects.length : 0} object(s)`,
    ipAddress: req.ip
  });
  res.status(201).json(result);
}));

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: Error & { status?: number; code?: string }) => {
      if (error.status) return res.status(error.status).json({ ok: false, message: error.message, code: error.code });
      next(error);
    });
  };
}
