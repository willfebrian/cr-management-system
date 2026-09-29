import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createUserRoutes } from "../src/server/routes/userRoutes";

async function serve(permissions: string[], work: (url: string, calls: string[]) => Promise<void>) {
  const calls: string[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).authUser = { id: 1, username: "ROOT", role: "ADMIN", permissions, mustChangePassword: false, isReminder: false };
    next();
  });
  app.use("/api/users", createUserRoutes({
    listManagedUsers: async () => { calls.push("list"); return { users: [], page: 1, pageSize: 25, total: 0 }; },
    updateManagedUserPermissions: async (_id: number, keys: string[]) => { calls.push(`save:${keys.join(",")}`); return { id: 2, permissions: keys }; }
  } as never));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try { await work(`http://127.0.0.1:${address.port}`, calls); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("users.view permits listing but not permission edits", async () => {
  await serve(["users.view"], async (url, calls) => {
    assert.equal((await fetch(`${url}/api/users`)).status, 200);
    assert.equal((await fetch(`${url}/api/users/2/permissions`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ permissions: ["issue.view"] })
    })).status, 403);
    assert.deepEqual(calls, ["list"]);
  });
});

test("users.manage permits saving explicit permission keys", async () => {
  await serve(["users.view", "users.manage"], async (url, calls) => {
    const response = await fetch(`${url}/api/users/2/permissions`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ permissions: ["issue.view"] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["save:issue.view"]);
  });
});

test("user creation forwards explicit grants to service", async () => {
  const captured: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).authUser = { id: 1, username: "ROOT", role: "ADMIN", permissions: ["users.view", "users.manage"] }; next(); });
  app.use("/api/users", createUserRoutes({
    createManagedUser: async (payload: unknown) => { captured.push(payload); return { id: 5, username: "NEW", role: "USER", permissions: ["issue.view"] }; }
  } as never));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/users`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "NEW", password: "initial1", role: "USER", permissions: ["issue.view"] })
    });
    assert.equal(response.status, 201);
    assert.deepEqual((captured[0] as any).permissions, ["issue.view"]);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
