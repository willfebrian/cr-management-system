import assert from "node:assert/strict";
import test from "node:test";
import { userFromToken } from "../src/server/auth/authService";
import { requirePermission } from "../src/server/auth/middleware";
import { publicUser } from "../src/server/routes/authRoutes";

const row = { id: 7, username: "EDITOR", role: "USER", mustChangePassword: false, isReminder: false };

test("session grants are loaded afresh for each request", async () => {
  let grants = ["issue.view"];
  const dependencies = {
    query: async () => ({ rows: [row] }),
    loadPermissions: async () => grants
  };
  assert.deepEqual((await userFromToken("token", dependencies as never))?.permissions, ["issue.view"]);
  grants = [];
  assert.deepEqual((await userFromToken("token", dependencies as never))?.permissions, []);
});

test("login and me user payload expose effective permissions", () => {
  assert.deepEqual(publicUser({ ...row, permissions: ["issue.view"] }).permissions, ["issue.view"]);
});

test("permission guard rejects missing grant with 403", () => {
  const middleware = requirePermission("issue.edit");
  let result: { status?: number; body?: unknown } = {};
  middleware({ authUser: { ...row, permissions: ["issue.view"] } } as never, {
    status(code: number) { result.status = code; return this; },
    json(body: unknown) { result.body = body; return this; }
  } as never, () => { throw new Error("unexpected next"); });
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { code: "PERMISSION_DENIED", message: "You do not have permission to perform this action." });
});

test("permission guard allows matching grant", () => {
  let allowed = false;
  requirePermission("issue.view")({ authUser: { ...row, permissions: ["issue.view"] } } as never, {} as never, () => { allowed = true; });
  assert.equal(allowed, true);
});

test("permission guard rejects unauthenticated request", () => {
  let status = 0;
  requirePermission("issue.view")({} as never, {
    status(code: number) { status = code; return this; }, json() { return this; }
  } as never, () => { throw new Error("unexpected next"); });
  assert.equal(status, 401);
});

test("admin-only permission rejects stale grant on a USER", () => {
  let status = 0;
  requirePermission("issue.cr_references")({ authUser: { ...row, permissions: ["issue.cr_references"] } } as never, {
    status(code: number) { status = code; return this; }, json() { return this; }
  } as never, () => { throw new Error("unexpected next"); });
  assert.equal(status, 403);
});
