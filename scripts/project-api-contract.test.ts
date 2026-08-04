import assert from "node:assert/strict";
import test from "node:test";
import * as projectApi from "../src/client/api/projectApi.js";

test("uses the authenticated Project read endpoints and query parameters", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ rows: [] });
  };
  try {
    await projectApi.fetchProjects({ q: "core", status: "planned", page: 2, pageSize: 10 });
    await projectApi.fetchProjectDetail(7);
    await projectApi.fetchProjectIssueOptions("D01K", 7);
    await projectApi.fetchProjectOwnerOptions("rina");
    assert.equal(calls[0]?.url, "/api/projects?q=core&status=planned&page=2&pageSize=10");
    assert.equal(calls[1]?.url, "/api/projects/7");
    assert.equal(calls[2]?.url, "/api/projects/issue-options?q=D01K&excludeProjectId=7");
    assert.equal(calls[3]?.url, "/api/projects/owner-options?q=rina");
    assert.ok(calls.every((call) => call.init?.credentials === "include"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creates, changes, cancels, and deletes Projects with the exact payload contract", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ ok: true });
  };
  const base = {
    projectName: "Core",
    ownerPersonId: 7,
    projectStatus: "planned" as const,
    issueIds: [3]
  };
  try {
    await projectApi.saveProject(base);
    await projectApi.saveProject({ ...base, id: 9, projectStatus: "in_progress" });
    await projectApi.cancelProject(9, "No budget");
    await projectApi.deleteProject(9);
    assert.deepEqual(calls.map(({ url, init }) => [url, init?.method]), [
      ["/api/projects", "POST"],
      ["/api/projects/9", "PUT"],
      ["/api/projects/9/cancel", "POST"],
      ["/api/projects/9", "DELETE"]
    ]);
    assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { reason: "No budget" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces server conflict messages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { message: "Issue belongs to PRJ-26009" },
    { status: 409 }
  );
  try {
    await assert.rejects(projectApi.fetchProjectDetail(7), /PRJ-26009/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checks readiness and downloads a Project CR Transport document", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    if (String(input).endsWith("readiness")) return Response.json({ ready: true, missingCount: 0, groups: [] });
    return new Response(new Blob(["docx"]), { headers: { "Content-Disposition": "attachment; filename=project.docx" } });
  };
  try {
    assert.equal((await projectApi.fetchProjectCrTransportReadiness(7)).ready, true);
    const download = await projectApi.downloadProjectCrTransport(7);
    assert.equal(download.filename, "project.docx");
    assert.equal(await download.blob.text(), "docx");
    assert.deepEqual(calls, [
      "/api/projects/7/cr-transport-readiness",
      "/api/projects/7/cr-transport-document"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
