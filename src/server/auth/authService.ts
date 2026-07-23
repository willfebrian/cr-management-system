import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";
import { pool } from "../db/pool";
import { config } from "../config";
const scrypt = promisify(nodeScrypt);
export type AuthUser = { id: number; username: string; role: "ADMIN" | "USER"; mustChangePassword: boolean };
const normalize = (value: string) => value.trim().toUpperCase();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); const key = (await scrypt(password, salt, 64)) as Buffer; return `scrypt$${salt}$${key.toString("hex")}`; }
export async function verifyPassword(password: string, stored: string) { const [, salt, expectedHex] = stored.split("$"); if (!salt || !expectedHex) return false; const actual = (await scrypt(password, salt, 64)) as Buffer; const expected = Buffer.from(expectedHex, "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export async function findUser(username: string) { const result = await pool.query("SELECT id, username, password_hash, role, is_active, must_change_password FROM app_users WHERE username = $1", [normalize(username)]); return result.rows[0] as (AuthUser & { password_hash: string; is_active: boolean }) | undefined; }
export async function createSession(userId: number, req: Request) { const token = randomBytes(32).toString("hex"); await pool.query("INSERT INTO app_user_sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)", [userId, tokenHash(token), config.auth.sessionTtlHours, req.get("user-agent") || null, req.ip]); return token; }
export async function userFromToken(token: string | undefined) { if (!token) return undefined; const result = await pool.query(`SELECT u.id, u.username, u.role, u.must_change_password FROM app_user_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active = true`, [tokenHash(token)]); const user = result.rows[0] as AuthUser | undefined; if (user) await pool.query("UPDATE app_user_sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash(token)]); return user; }
export async function revokeToken(token: string | undefined) { if (token) await pool.query("UPDATE app_user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash(token)]); }
export async function setPassword(userId: number, password: string) { await pool.query("UPDATE app_users SET password_hash = $1, must_change_password = false, password_changed_at = now(), updated_at = now() WHERE id = $2", [await hashPassword(password), userId]); }
export function cookieToken(req: Request) { const header = req.get("cookie") || ""; return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${config.auth.cookieName}=`))?.split("=").slice(1).join("="); }
