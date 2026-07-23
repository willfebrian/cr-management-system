import type { NextFunction, Request, Response } from "express";
import { cookieToken, userFromToken, type AuthUser } from "./authService";
declare global { namespace Express { interface Request { authUser?: AuthUser; authToken?: string } } }
export async function requireAuth(req: Request, res: Response, next: NextFunction) { try { const token = cookieToken(req); const user = await userFromToken(token); if (!user) return res.status(401).json({ message: "Authentication required" }); req.authUser = user; req.authToken = token; next(); } catch (error) { next(error); } }
export function requireAdmin(req: Request, res: Response, next: NextFunction) { if (req.authUser?.role !== "ADMIN") return res.status(403).json({ message: "Administrator access required" }); next(); }
