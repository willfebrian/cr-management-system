import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createUserRoutes } from "../src/server/routes/userRoutes";
import { UserManagementError } from "../src/server/users/userManagementDomain";

const user = {
  id: 2,
  username: "ALICE",
  role: "USER" as const,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  deletedAt: null,
  deletedBySnapshot: null,
  deleteReason: null
};

function fakeService(overrides: Record<string, Function> = {}) {
  return {
    listManagedUsers: async () => ({ users: [user], page: 1, pageSize: 25, total: 1 }),
    getManagedUserAudit: async () => [],
    createManagedUser: async () => user,
    updateManagedUserProfile: async () => user,
    setManagedUserStatus: async () => user,
    resetManagedUserPassword: async () => undefined,
    revokeManagedUserSessions: async () => undefined,
    archiveManagedUser: async () => undefined,
    restoreManagedUser: async () => user,
    ...overrides
  };
}

async function withServer(
  service: ReturnType<typeof fakeService>,
  operation: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.get("x-role");
    if (role) {
      (req as any).authUser = {
        id: Number(req.get("x-user-id") ?? 1),
        username: "ROOT",
        role,
        mustChangePassword: false
      };
    }
    next();
  });
  app.use("/api/users", createUserRoutes(service as any));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: error instanceof Error ? error.message : "error" });
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

test("all user-management endpoints reject non-admin callers", async () => {
  let called = 0;
  const service = fakeService({
    listManagedUsers: async () => {
      called += 1;
      return { users: [], page: 1, pageSize: 25, total: 0 };
    }
  });
  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/users`, {
      headers: { "x-role": "USER" }
    });
    assert.equal(response.status, 403);
    assert.equal(called, 0);
  });
});

test("parses current/archived list filters and returns safe managed users", async () => {
  let received: any;
  const service = fakeService({
    listManagedUsers: async (filters: unknown) => {
      received = filters;
      return { users: [user], page: 2, pageSize: 10, total: 1 };
    }
  });
  await withServer(service, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/users?q=ali&role=USER&status=inactive&scope=archived&page=2&pageSize=10`,
      { headers: { "x-role": "ADMIN" } }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      q: "ali",
      role: "USER",
      status: "inactive",
      scope: "archived",
      page: 2,
      pageSize: 10
    });
    const body = await response.json() as any;
    assert.equal(body.users[0].username, "ALICE");
    assert.doesNotMatch(JSON.stringify(body), /password_hash|passwordHash/);
  });
});

test("maps archived username conflicts to 409 with restore guidance", async () => {
  const service = fakeService({
    createManagedUser: async () => {
      throw new UserManagementError(
        "Restore user",
        409,
        "ARCHIVED_USERNAME",
        { archivedUserId: 42, canRestore: true }
      );
    }
  });
  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-role": "ADMIN" },
      body: JSON.stringify({ username: "OLD", password: "initial1", role: "USER" })
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      message: "Restore user",
      code: "ARCHIVED_USERNAME",
      archivedUserId: 42,
      canRestore: true
    });
  });
});

test("maps validation/protection errors and exposes every lifecycle route", async () => {
  const paths: string[] = [];
  const service = fakeService({
    updateManagedUserProfile: async () => {
      paths.push("profile");
      throw new UserManagementError("Protected", 403);
    },
    setManagedUserStatus: async () => {
      paths.push("status");
      return user;
    },
    resetManagedUserPassword: async () => { paths.push("password"); },
    revokeManagedUserSessions: async () => { paths.push("revoke"); },
    getManagedUserAudit: async () => { paths.push("audit"); return []; },
    archiveManagedUser: async () => { paths.push("archive"); },
    restoreManagedUser: async () => { paths.push("restore"); return user; }
  });
  await withServer(service, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-role": "ADMIN" };
    const profile = await fetch(`${baseUrl}/api/users/2/profile`, {
      method: "PATCH", headers, body: JSON.stringify({ role: "USER" })
    });
    assert.equal(profile.status, 403);
    const invalidStatus = await fetch(`${baseUrl}/api/users/2/status`, {
      method: "PATCH", headers, body: JSON.stringify({ isActive: "false" })
    });
    assert.equal(invalidStatus.status, 400);
    await fetch(`${baseUrl}/api/users/2/status`, {
      method: "PATCH", headers, body: JSON.stringify({ isActive: false })
    });
    await fetch(`${baseUrl}/api/users/2/password`, {
      method: "PATCH", headers, body: JSON.stringify({ password: "initial1" })
    });
    await fetch(`${baseUrl}/api/users/2/revoke-sessions`, { method: "POST", headers });
    await fetch(`${baseUrl}/api/users/2/audit`, { headers });
    await fetch(`${baseUrl}/api/users/2`, {
      method: "DELETE", headers, body: JSON.stringify({ reason: "Left" })
    });
    await fetch(`${baseUrl}/api/users/2/restore`, {
      method: "POST",
      headers,
      body: JSON.stringify({ password: "initial2", role: "USER", isActive: true })
    });
    assert.deepEqual(paths, [
      "profile", "status", "password", "revoke", "audit", "archive", "restore"
    ]);
  });
});
