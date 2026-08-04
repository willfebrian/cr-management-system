import assert from "node:assert/strict";
import test from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import { createProjectRoutes } from "../src/server/routes/projectRoutes.js";
import { ProjectRepositoryError } from "../src/server/db/projectRepository.js";

const detail = {
  project: {
    id: 2, projectNo: 26002, projectKey: "PRJ-26002", projectName: "Core",
    ownerPersonId: 7, ownerName: "Rina", projectStatus: "planned" as const, issueCount: 0,
    createdBy: "USER1", createdAt: "2026-07-31", updatedBy: "USER1", updatedAt: "2026-07-31"
  },
  issues: [],
  statusHistory: []
};

test("requires authentication and sources save actors from req.authUser", async () => {
  let savedActor: unknown;
  const routes = createProjectRoutes({
    repository: {
      listProjects: async () => ({ rows: [], page: 1, pageSize: 25, total: 0, totalPages: 1 }),
      getProjectDetail: async () => detail,
      searchProjectIssueOptions: async () => [],
      searchProjectOwners: async () => [],
      saveProject: async (_payload, actor) => {
        savedActor = actor;
        return detail;
      },
      cancelProject: async () => detail,
      deleteProject: async (id) => ({ ok: true as const, id })
    },
    requireAuth: testAuth,
    requireAdmin: testAdmin
  });
  await withServer(routes, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/projects`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "USER" },
      body: JSON.stringify({
        projectName: "Core", ownerPersonId: 7, projectStatus: "planned", issueIds: [],
        actor: { id: 999, username: "FORGED" }
      })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(savedActor, {
      id: 11, username: "SESSION_USER", role: "USER", mustChangePassword: false
    });
  });
});

test("allows USER cancellation but protects hard delete with admin middleware", async () => {
  const deletedBy: string[] = [];
  const routes = createProjectRoutes({
    repository: {
      listProjects: async () => ({ rows: [], page: 1, pageSize: 25, total: 0, totalPages: 1 }),
      getProjectDetail: async () => detail,
      searchProjectIssueOptions: async () => [],
      searchProjectOwners: async () => [],
      saveProject: async () => detail,
      cancelProject: async () => detail,
      deleteProject: async (id, actor) => {
        deletedBy.push(actor.role);
        return { ok: true as const, id };
      }
    },
    requireAuth: testAuth,
    requireAdmin: testAdmin
  });
  await withServer(routes, async (baseUrl) => {
    const cancel = await fetch(`${baseUrl}/api/projects/2/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "USER" },
      body: JSON.stringify({ reason: "No budget" })
    });
    assert.equal(cancel.status, 200);

    const forbidden = await fetch(`${baseUrl}/api/projects/2`, {
      method: "DELETE",
      headers: { "x-test-user": "USER" }
    });
    assert.equal(forbidden.status, 403);
    const deleted = await fetch(`${baseUrl}/api/projects/2`, {
      method: "DELETE",
      headers: { "x-test-user": "ADMIN" }
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deletedBy, ["ADMIN"]);
  });
});

test("maps validation, missing, and assignment-conflict errors to their API status", async () => {
  const routes = createProjectRoutes({
    repository: {
      listProjects: async () => { throw new ProjectRepositoryError("bad", 400); },
      getProjectDetail: async () => { throw new ProjectRepositoryError("missing", 404); },
      searchProjectIssueOptions: async () => [],
      searchProjectOwners: async () => [],
      saveProject: async () => { throw new ProjectRepositoryError("owned by PRJ-26009", 409); },
      cancelProject: async () => detail,
      deleteProject: async (id) => ({ ok: true as const, id })
    },
    requireAuth: testAuth,
    requireAdmin: testAdmin
  });
  await withServer(routes, async (baseUrl) => {
    const headers = { "Content-Type": "application/json", "x-test-user": "USER" };
    assert.equal((await fetch(`${baseUrl}/api/projects`, { headers })).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/projects/404`, { headers })).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/projects`, {
      method: "POST", headers, body: JSON.stringify({})
    })).status, 409);
  });
});

test("returns Project readiness and downloads the Project CR Transport document", async () => {
  const readiness = { ready: true, missingCount: 0, groups: [] };
  const routes = createProjectRoutes({
    repository: {
      listProjects: async () => ({ rows: [], page: 1, pageSize: 25, total: 0, totalPages: 1 }),
      getProjectDetail: async () => detail,
      searchProjectIssueOptions: async () => [], searchProjectOwners: async () => [],
      saveProject: async () => detail, cancelProject: async () => detail,
      deleteProject: async (id) => ({ ok: true as const, id })
    },
    documentService: {
      getReadiness: async () => readiness,
      buildDocument: async () => ({ filename: "CR Transport Project PRJ-26002.docx", buffer: Buffer.from("docx") })
    },
    requireAuth: testAuth,
    requireAdmin: testAdmin
  });
  await withServer(routes, async (baseUrl) => {
    const headers = { "x-test-user": "USER" };
    const readinessResponse = await fetch(`${baseUrl}/api/projects/2/cr-transport-readiness`, { headers });
    assert.equal(readinessResponse.status, 200);
    assert.deepEqual(await readinessResponse.json(), readiness);
    const documentResponse = await fetch(`${baseUrl}/api/projects/2/cr-transport-document`, { headers });
    assert.equal(documentResponse.status, 200);
    assert.match(documentResponse.headers.get("content-type") || "", /wordprocessingml/);
    assert.match(documentResponse.headers.get("content-disposition") || "", /CR Transport Project PRJ-26002\.docx/);
    assert.equal(await documentResponse.text(), "docx");
  });
});

function testAuth(req: Request, res: Response, next: NextFunction) {
  const role = req.get("x-test-user");
  if (!role) return res.status(401).json({ message: "Authentication required" });
  req.authUser = {
    id: 11,
    username: "SESSION_USER",
    role: role === "ADMIN" ? "ADMIN" : "USER",
    mustChangePassword: false
  };
  next();
}

function testAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.authUser?.role !== "ADMIN") return res.status(403).json({ message: "Administrator access required" });
  next();
}

async function withServer(router: express.Router, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/api/projects", router);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server address unavailable");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
