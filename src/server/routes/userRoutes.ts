import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAdmin } from "../auth/middleware";
import type {
  ManagedUserListFilters,
  ManagementActor,
  UserRole
} from "../../shared/userManagementTypes";
import {
  archiveManagedUser,
  createManagedUser,
  getManagedUserAudit,
  listManagedUsers,
  resetManagedUserPassword,
  restoreManagedUser,
  revokeManagedUserSessions,
  setManagedUserStatus,
  updateManagedUserProfile
} from "../users/userManagementService";
import { UserManagementError } from "../users/userManagementDomain";
import { recordActivityLog } from "../db/auditRepository.js";

type UserManagementService = {
  listManagedUsers: typeof listManagedUsers;
  getManagedUserAudit: typeof getManagedUserAudit;
  createManagedUser: typeof createManagedUser;
  updateManagedUserProfile: typeof updateManagedUserProfile;
  setManagedUserStatus: typeof setManagedUserStatus;
  resetManagedUserPassword: typeof resetManagedUserPassword;
  revokeManagedUserSessions: typeof revokeManagedUserSessions;
  archiveManagedUser: typeof archiveManagedUser;
  restoreManagedUser: typeof restoreManagedUser;
};

const defaultService: UserManagementService = {
  listManagedUsers,
  getManagedUserAudit,
  createManagedUser,
  updateManagedUserProfile,
  setManagedUserStatus,
  resetManagedUserPassword,
  revokeManagedUserSessions,
  archiveManagedUser,
  restoreManagedUser
};

function actorFrom(req: Request): ManagementActor {
  const user = req.authUser!;
  return { id: user.id, username: user.username, role: user.role };
}

function parseUserId(req: Request): number {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new UserManagementError("User ID tidak valid");
  }
  return userId;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new UserManagementError(`${field} tidak valid`);
  }
  return parsed;
}

function parseFilters(req: Request): ManagedUserListFilters {
  const role = req.query.role;
  const status = req.query.status;
  const scope = req.query.scope;
  if (role != null && role !== "ADMIN" && role !== "USER") {
    throw new UserManagementError("Role filter tidak valid");
  }
  if (status != null && status !== "active" && status !== "inactive") {
    throw new UserManagementError("Status filter tidak valid");
  }
  if (scope != null && scope !== "current" && scope !== "archived") {
    throw new UserManagementError("Scope filter tidak valid");
  }
  return {
    q: req.query.q == null ? undefined : String(req.query.q),
    role: role as UserRole | undefined,
    status: status as "active" | "inactive" | undefined,
    scope: scope as "current" | "archived" | undefined,
    page: optionalInteger(req.query.page, "Page"),
    pageSize: optionalInteger(req.query.pageSize, "Page size")
  };
}

function handleError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof UserManagementError) {
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
      ...error.details
    });
    return;
  }
  next(error);
}

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

function route(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch((error) => handleError(error, res, next));
  };
}

export function createUserRoutes(service: UserManagementService = defaultService): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get("/", route(async (req, res) => {
    res.json(await service.listManagedUsers(parseFilters(req), actorFrom(req)));
  }));

  router.get("/:id/audit", route(async (req, res) => {
    const audit = await service.getManagedUserAudit(parseUserId(req), actorFrom(req));
    res.json({ audit });
  }));

  router.post("/", route(async (req, res) => {
    const role = req.body?.role;
    const isActive = req.body?.isActive;
    if (role !== "ADMIN" && role !== "USER") {
      throw new UserManagementError("Role tidak valid");
    }
    if (isActive != null && typeof isActive !== "boolean") {
      throw new UserManagementError("Status tidak valid");
    }
    const user = await service.createManagedUser(
      {
        username: String(req.body?.username ?? ""),
        password: String(req.body?.password ?? ""),
        role,
        isActive
      },
      actorFrom(req)
    );
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "create_user",
      username: actor.username,
      userId: actor.id,
      description: `Created new user "${user.username}" (Role: ${user.role})`,
      ipAddress: req.ip
    });
    res.status(201).json({ user });
  }));

  router.patch("/:id/profile", route(async (req, res) => {
    const role = req.body?.role;
    if (role != null && role !== "ADMIN" && role !== "USER") {
      throw new UserManagementError("Role tidak valid");
    }
    const user = await service.updateManagedUserProfile(
      parseUserId(req),
      {
        username: req.body?.username == null ? undefined : String(req.body.username),
        role
      },
      actorFrom(req)
    );
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "update_user_profile",
      username: actor.username,
      userId: actor.id,
      description: `Updated profile for user "${user.username}"`,
      ipAddress: req.ip
    });
    res.json({ user });
  }));

  router.patch("/:id/status", route(async (req, res) => {
    if (typeof req.body?.isActive !== "boolean") {
      throw new UserManagementError("Status tidak valid");
    }
    const user = await service.setManagedUserStatus(
      parseUserId(req),
      req.body.isActive,
      actorFrom(req)
    );
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "update_user_status",
      username: actor.username,
      userId: actor.id,
      description: `Changed user "${user.username}" status to ${req.body.isActive ? "Active" : "Inactive"}`,
      ipAddress: req.ip
    });
    res.json({ user });
  }));

  router.patch("/:id/password", route(async (req, res) => {
    await service.resetManagedUserPassword(
      parseUserId(req),
      String(req.body?.password ?? ""),
      actorFrom(req)
    );
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "reset_user_password",
      username: actor.username,
      userId: actor.id,
      description: `Reset password for user ID ${req.params.id}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  }));

  router.post("/:id/revoke-sessions", route(async (req, res) => {
    await service.revokeManagedUserSessions(parseUserId(req), actorFrom(req));
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "revoke_user_sessions",
      username: actor.username,
      userId: actor.id,
      description: `Revoked all active sessions for user ID ${req.params.id}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  }));

  router.delete("/:id", route(async (req, res) => {
    const reason = String(req.body?.reason ?? "");
    await service.archiveManagedUser(
      parseUserId(req),
      reason,
      actorFrom(req)
    );
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "delete_user",
      username: actor.username,
      userId: actor.id,
      description: `Archived/Deleted user ID ${req.params.id}${reason ? ` (Reason: ${reason})` : ""}`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  }));

  router.post("/:id/restore", route(async (req, res) => {
    const role = req.body?.role;
    if (role !== "ADMIN" && role !== "USER") {
      throw new UserManagementError("Role tidak valid");
    }
    if (typeof req.body?.isActive !== "boolean") {
      throw new UserManagementError("Status tidak valid");
    }
    const user = await service.restoreManagedUser(
      parseUserId(req),
      {
        password: String(req.body?.password ?? ""),
        role,
        isActive: req.body.isActive
      },
      actorFrom(req)
    );
    const actor = actorFrom(req);
    await recordActivityLog({
      activityType: "master_data",
      action: "restore_user",
      username: actor.username,
      userId: actor.id,
      description: `Restored archived user "${user.username}"`,
      ipAddress: req.ip
    });
    res.json({ user });
  }));

  return router;
}

export const userRoutes = createUserRoutes();
