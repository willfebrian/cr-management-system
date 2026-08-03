import assert from "node:assert/strict";
import test from "node:test";
import * as authService from "../src/server/auth/authService";

test("normalizes PostgreSQL bigint auth IDs to numbers for self-protection checks", () => {
  const normalizeAuthUserRow = (authService as any).normalizeAuthUserRow;
  const user = normalizeAuthUserRow({
    id: "1",
    username: "TRST-WILLIAM",
    role: "ADMIN",
    mustChangePassword: false,
    lastLoginAt: null
  });

  assert.equal(user.id, 1);
  assert.equal(typeof user.id, "number");
});
