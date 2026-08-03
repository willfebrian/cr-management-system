import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  sessionCookieMaxAgeSeconds,
  type AuthSessionPolicy
} from "../src/server/auth/sessionPolicy";

const persistentPolicy: AuthSessionPolicy = {
  sessionPersistent: true,
  sessionIdleHours: 8,
  sessionMaxLifetimeHours: 168,
  cookieMaxAgeDays: 400
};

test("persistent sessions use the configured browser-compatible cookie lifetime", () => {
  assert.equal(sessionCookieMaxAgeSeconds(persistentPolicy), 400 * 24 * 60 * 60);
});

test("legacy sessions use the shortest configured lifetime at login", () => {
  assert.equal(sessionCookieMaxAgeSeconds({ ...persistentPolicy, sessionPersistent: false }), 8 * 60 * 60);
});

test("legacy refreshed sessions use their remaining database lifetime", () => {
  const now = Date.parse("2026-08-03T00:00:00.000Z");
  const expiresAt = new Date(now + 90_000);
  assert.equal(
    sessionCookieMaxAgeSeconds({ ...persistentPolicy, sessionPersistent: false }, expiresAt, now),
    90
  );
});

test("persistent database sessions use infinity without reviving expired sessions", async () => {
  const source = await readFile(new URL("../src/server/auth/authService.ts", import.meta.url), "utf8");

  assert.match(source, /CASE WHEN \$3::boolean THEN 'infinity'::timestamptz/);
  assert.match(source, /CASE WHEN \$2::boolean THEN 'infinity'::timestamptz/);
  assert.match(source, /s\.revoked_at IS NULL AND s\.expires_at > now\(\)/);
});
