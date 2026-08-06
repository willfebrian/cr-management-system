import { Router } from "express";
import { config } from "../config";
import { createSession, findUser, revokeToken, sessionCookie, setPassword, verifyPassword } from "../auth/authService";
import { sessionCookieMaxAgeSeconds } from "../auth/sessionPolicy";
import { requireAuth } from "../auth/middleware";
import { pool } from "../db/pool";
export const authRoutes = Router();
const publicUser = (user: any) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  mustChangePassword: user.must_change_password ?? user.mustChangePassword,
  lastLoginAt: user.last_login_at ?? user.lastLoginAt ?? null
});
import { recordActivityLog } from "../db/auditRepository.js";

authRoutes.get("/me", requireAuth, (req, res) => res.json({ user: req.authUser }));
authRoutes.post("/login", async (req, res, next) => {
  try {
    const usernameInput = String(req.body?.username || "");
    const user = await findUser(usernameInput);
    const password = String(req.body?.password || "");
    if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
      await recordActivityLog({
        activityType: "auth",
        action: "login_failed",
        username: usernameInput || "unknown",
        description: `Failed login attempt for username "${usernameInput}"`,
        ipAddress: req.ip
      });
      return res.status(401).json({ message: "Username atau password salah" });
    }
    const token = await createSession(user.id, req);
    const loginResult = await pool.query("UPDATE app_users SET last_login_at = now() WHERE id = $1 RETURNING last_login_at", [user.id]);
    res.setHeader("Set-Cookie", sessionCookie(token, sessionCookieMaxAgeSeconds(config.auth)));
    await recordActivityLog({
      activityType: "auth",
      action: "login",
      username: user.username,
      userId: user.id,
      description: `User "${user.username}" logged in successfully`,
      ipAddress: req.ip
    });
    res.json({ user: publicUser({ ...user, last_login_at: loginResult.rows[0]?.last_login_at }) });
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await recordActivityLog({
      activityType: "auth",
      action: "logout",
      username: req.authUser?.username || "unknown",
      userId: req.authUser?.id || null,
      description: `User "${req.authUser?.username}" logged out`,
      ipAddress: req.ip
    });
    await revokeToken(req.authToken);
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const nextPassword = String(req.body?.newPassword || "");
    if (nextPassword.length < 8) return res.status(400).json({ message: "Password minimal 8 karakter" });
    const user = await findUser(req.authUser!.username);
    if (!user || !(await verifyPassword(String(req.body?.currentPassword || ""), user.password_hash))) return res.status(400).json({ message: "Password saat ini salah" });
    await setPassword(user.id, nextPassword);
    await recordActivityLog({
      activityType: "auth",
      action: "change_password",
      username: req.authUser?.username || "unknown",
      userId: req.authUser?.id || null,
      description: `User "${req.authUser?.username}" changed their password`,
      ipAddress: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
