import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveManagedUser,
  createManagedUser,
  fetchManagedUserAudit,
  fetchManagedUsers,
  ManagedUserApiError,
  resetManagedUserPassword,
  restoreManagedUser,
  revokeManagedUserSessions,
  setManagedUserStatus,
  updateManagedUserProfile
} from "../src/client/api/userManagementApi";

type FetchCall = { url: string; init: RequestInit };

function captureFetch(body: unknown = { ok: true }) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;
  return {
    calls,
    restore() { globalThis.fetch = original; }
  };
}

test("fetches filtered current or archived users with encoded pagination", async () => {
  const capture = captureFetch({ users: [], page: 2, pageSize: 10, total: 0 });
  try {
    await fetchManagedUsers({
      q: "A B",
      role: "ADMIN",
      status: "inactive",
      scope: "archived",
      page: 2,
      pageSize: 10
    });
    assert.equal(
      capture.calls[0]?.url,
      "/api/users?q=A+B&role=ADMIN&status=inactive&scope=archived&page=2&pageSize=10"
    );
    assert.equal(capture.calls[0]?.init.credentials, "include");
  } finally {
    capture.restore();
  }
});

test("sends every lifecycle operation to its explicit endpoint and body", async () => {
  const capture = captureFetch({ user: { id: 2 }, audit: [], ok: true });
  try {
    await fetchManagedUserAudit(2);
    await createManagedUser({ username: "ALICE", password: "initial1", role: "USER", isActive: true });
    await updateManagedUserProfile(2, { username: "ALICE2", role: "ADMIN" });
    await setManagedUserStatus(2, false);
    await resetManagedUserPassword(2, "initial2");
    await revokeManagedUserSessions(2);
    await archiveManagedUser(2, "Left");
    await restoreManagedUser(2, { password: "initial3", role: "USER", isActive: false });

    assert.deepEqual(
      capture.calls.map(({ url, init }) => [init.method ?? "GET", url]),
      [
        ["GET", "/api/users/2/audit"],
        ["POST", "/api/users"],
        ["PATCH", "/api/users/2/profile"],
        ["PATCH", "/api/users/2/status"],
        ["PATCH", "/api/users/2/password"],
        ["POST", "/api/users/2/revoke-sessions"],
        ["DELETE", "/api/users/2"],
        ["POST", "/api/users/2/restore"]
      ]
    );
    assert.deepEqual(JSON.parse(String(capture.calls[1]?.init.body)), {
      username: "ALICE", password: "initial1", role: "USER", isActive: true
    });
    assert.deepEqual(JSON.parse(String(capture.calls[2]?.init.body)), {
      username: "ALICE2", role: "ADMIN"
    });
    assert.deepEqual(JSON.parse(String(capture.calls[3]?.init.body)), { isActive: false });
    assert.deepEqual(JSON.parse(String(capture.calls[4]?.init.body)), { password: "initial2" });
    assert.deepEqual(JSON.parse(String(capture.calls[6]?.init.body)), { reason: "Left" });
    assert.deepEqual(JSON.parse(String(capture.calls[7]?.init.body)), {
      password: "initial3", role: "USER", isActive: false
    });
    assert.ok(capture.calls.every((call) => call.init.credentials === "include"));
  } finally {
    capture.restore();
  }
});

test("preserves archived-user restore guidance on API conflicts", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    message: "Restore user",
    code: "ARCHIVED_USERNAME",
    archivedUserId: 42,
    canRestore: true
  }), { status: 409, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    await assert.rejects(
      () => createManagedUser({ username: "OLD", password: "initial1", role: "USER" }),
      (error: unknown) => {
        assert.ok(error instanceof ManagedUserApiError);
        assert.equal(error.status, 409);
        assert.equal(error.code, "ARCHIVED_USERNAME");
        assert.equal(error.details.archivedUserId, 42);
        assert.equal(error.details.canRestore, true);
        return true;
      }
    );
  } finally {
    globalThis.fetch = original;
  }
});
