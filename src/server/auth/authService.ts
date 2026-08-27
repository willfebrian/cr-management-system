import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";
import { pool } from "../db/pool";
import { config } from "../config";
const scrypt = promisify(nodeScrypt);
export type AuthUser = { id: number; username: string; role: "ADMIN" | "USER"; mustChangePassword: boolean; lastLoginAt?: string | null; isReminder: boolean };
export function normalizeAuthUserRow<T extends Record<string, any>>(row: T): T & AuthUser {
  return {
    ...row,
    id: Number(row.id),
    mustChangePassword: row.mustChangePassword ?? row.must_change_password,
    lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
    isReminder: Boolean(row.isReminder ?? row.is_reminder)
  } as T & AuthUser;
}
const normalize = (value: string) => value.trim().toUpperCase();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const key = (await scrypt(password, salt, 64)) as Buffer; return `scrypt$${salt}$${key.toString("hex")}`; }
export async function verifyPassword(password: string, stored: string) { const [, salt, expectedHex] = stored.split("$"); if (!salt || !expectedHex) return false; const actual = (await scrypt(password, salt, 64)) as Buffer; const expected = Buffer.from(expectedHex, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export async function findUser(username: string) { const result = await pool.query("SELECT u.id, u.username, u.password_hash, u.role, u.is_active, u.must_change_password, u.last_login_at, coalesce(p.is_reminder, false) AS \"isReminder\" FROM app_users u LEFT JOIN issue_people p ON p.id = u.person_id WHERE u.username = $1 AND u.deleted_at IS NULL", [normalize(username)]); const row = result.rows[0]; return row ? normalizeAuthUserRow(row) as (AuthUser & { password_hash: string; is_active: boolean; last_login_at?: string | null }) : undefined; }
export async function createSession(userId: number, req: Request) { const token = randomBytes(32).toString("hex"); await pool.query("INSERT INTO app_user_sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2, CASE WHEN $3::boolean THEN 'infinity'::timestamptz ELSE LEAST(now() + make_interval(hours => $4), now() + make_interval(hours => $5)) END, $6, $7)", [userId, tokenHash(token), config.auth.sessionPersistent, config.auth.sessionIdleHours, config.auth.sessionMaxLifetimeHours, req.get("user-agent") || null, req.ip]); return token; }
export async function userFromToken(token: string | undefined) { if (!token) return undefined; const result = await pool.query(`SELECT u.id, u.username, u.role, u.must_change_password AS "mustChangePassword", u.last_login_at AS "lastLoginAt", coalesce(p.is_reminder, false) AS "isReminder" FROM app_user_sessions s JOIN app_users u ON u.id = s.user_id LEFT JOIN issue_people p ON p.id = u.person_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = true AND u.deleted_at IS NULL`, [tokenHash(token)]); const row = result.rows[0]; return row ? normalizeAuthUserRow(row) : undefined; }
export async function refreshSession(token: string | undefined) { if (!token) return undefined; const result = await pool.query(`UPDATE app_user_sessions s SET last_seen_at = now(), expires_at = CASE WHEN $2::boolean THEN 'infinity'::timestamptz ELSE LEAST(now() + make_interval(hours => $3), s.created_at + make_interval(hours => $4)) END FROM app_users u WHERE s.user_id = u.id AND s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = true AND u.deleted_at IS NULL RETURNING s.expires_at`, [tokenHash(token), config.auth.sessionPersistent, config.auth.sessionIdleHours, config.auth.sessionMaxLifetimeHours]); return result.rows[0]?.expires_at as Date | undefined; }
export function sessionCookie(token: string, maxAge: number) { return `${config.auth.cookieName}=${token}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}; HttpOnly; SameSite=Lax${config.auth.cookieSecure ? "; Secure" : ""}`; }
export async function revokeToken(token: string | undefined) { if (token) await pool.query("UPDATE app_user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash(token)]); }
export async function setPassword(userId: number, password: string) { await pool.query("UPDATE app_users SET password_hash = $1, must_change_password = false, password_changed_at = now(), updated_at = now() WHERE id = $2", [await hashPassword(password), userId]); }
export function cookieToken(req: Request) { const header = req.get("cookie") || ""; return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${config.auth.cookieName}=`))?.split("=").slice(1).join("="); }
