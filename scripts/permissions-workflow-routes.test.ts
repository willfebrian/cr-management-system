import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { crRoutes } from "../src/server/routes/crRoutes";
import { transportRequestRoutes } from "../src/server/routes/transportRequestRoutes";
import { transportReleaseRoutes } from "../src/server/routes/transportReleaseRoutes";
import { createProjectRoutes } from "../src/server/routes/projectRoutes";
import { aiRoutes } from "../src/server/routes/aiRoutes";
import { outlookRoutes } from "../src/server/routes/outlookRoutes";
import { auditRoutes } from "../src/server/routes/auditRoutes";

async function serve(work: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).authUser = { id: 1, username: "ADMIN", role: "ADMIN", permissions: [] };
    next();
  });
  app.use("/api/cr-transports/release", transportReleaseRoutes);
  app.use("/api/cr-transports", transportRequestRoutes);
  app.use("/api/projects", createProjectRoutes({
    repository: {
      listProjects: async () => { throw new Error("called"); },
      getProjectDetail: async () => { throw new Error("called"); },
      searchProjectIssueOptions: async () => { throw new Error("called"); },
      searchProjectOwners: async () => { throw new Error("called"); },
      saveProject: async () => { throw new Error("called"); },
      cancelProject: async () => { throw new Error("called"); },
      deleteProject: async () => { throw new Error("called"); }
    } as never,
    requireAuth: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next()
  }));
  app.use("/api/ai", aiRoutes);
  app.use("/api/outlook", outlookRoutes);
  app.use("/api", auditRoutes);
  app.use("/api", crRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await work(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("feature routes deny an ADMIN without explicit grants before running services", async () => {
  const routes: [string, string, unknown?][] = [
    ["POST", "/api/cr-transports/resolve-object", {}],
    ["POST", "/api/cr-transports/preflight", {}],
    ["POST", "/api/cr-transports/create", {}],
    ["GET", "/api/cr-transports/release/candidates"],
    ["POST", "/api/cr-transports/release/test-run", {}],
    ["POST", "/api/cr-transports/release/operations", {}],
    ["GET", "/api/cr-transports/release/operations/1"],
    ["POST", "/api/cr-transports/release/execute", {}],
    ["GET", "/api/cr/export"],
    ["GET", "/api/issues/export"],
    ["POST", "/api/sync/cr", {}],
    ["POST", "/api/issues", {}],
    ["PUT", "/api/issues/1", {}],
    ["POST", "/api/issues/1/cancel", {}],
    ["GET", "/api/issues/1/templates/email"],
    ["GET", "/api/issues/1/templates/ticket"],
    ["GET", "/api/issues/1/templates/cr-transport"],
    ["GET", "/api/issues/1/templates/cr-user"],
    ["POST", "/api/issues/1/reminder", {}],
    ["POST", "/api/projects", {}],
    ["PUT", "/api/projects/1", {}],
    ["POST", "/api/projects/1/cancel", {}],
    ["GET", "/api/projects/1/cr-transport-document"],
    ["POST", "/api/ai/generate-analysis", {}],
    ["POST", "/api/ai/test-connection", {}],
    ["GET", "/api/outlook/search-email"],
    ["POST", "/api/outlook/test-mcp-connection", {}],
    ["GET", "/api/audit-logs"]
  ];
  await serve(async (url) => {
    for (const [method, path, body] of routes) {
      const response = await fetch(url + path, {
        method,
        headers: body == null ? undefined : { "content-type": "application/json" },
        body: body == null ? undefined : JSON.stringify(body)
      });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
  });
});
