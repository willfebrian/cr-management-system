import type { NextFunction, Request, Response } from "express";
import { cookieToken, refreshSession, sessionCookie, userFromToken, type AuthUser } from "./authService";
import { config } from "../config";
import { sessionCookieMaxAgeSeconds } from "./sessionPolicy";
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      authToken?: string;
    }
  }
}

export async function resolveAuthUser(req: Request): Promise<AuthUser | null> {
  if (req.authUser) return req.authUser;
  try {
    const token = cookieToken(req);
    if (!token) return null;
    const user = await userFromToken(token);
    if (!user) return null;
    req.authUser = user;
    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) { try { const token = cookieToken(req); if (!token) return res.status(401).json({ message: "Authentication required" }); const user = await userFromToken(token); if (!user) return res.status(401).json({ message: "Authentication required" }); const expiresAt = await refreshSession(token); if (!expiresAt) return res.status(401).json({ message: "Authentication required" }); res.setHeader("Set-Cookie", sessionCookie(token, sessionCookieMaxAgeSeconds(config.auth, expiresAt))); req.authUser = user; req.authToken = token; next(); } catch (error) { next(error); } }
export function requireAdmin(req: Request, res: Response, next: NextFunction) { if (req.authUser?.role !== "ADMIN") return res.status(403).json({ message: "Administrator access required" }); next(); }
