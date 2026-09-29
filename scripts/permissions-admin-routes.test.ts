import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { adminRoutes } from "../src/server/routes/adminRoutes";
import { auditRoutes } from "../src/server/routes/auditRoutes";
import { visibleSettings, writableSettings } from "../src/server/admin/settingsPermissionPolicy";

async function serve(permissions: string[], work: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { (req as any).authUser = { role: "USER", permissions }; next(); });
  app.use("/api/admin", adminRoutes); app.use("/api", auditRoutes);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await work(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("appearance-only settings never expose connection or AI secrets", () => {
  const scoped = visibleSettings({ app_font_size: "14", status_color_open_bg: "red", exchange_pass: "secret", nine_router_api_key: "secret", outlook_mcp_config: "secret", template_body_glpi: "text", unknown_secret: "secret" }, ["settings.appearance"]);
  assert.deepEqual(scoped, { app_font_size: "14", status_color_open_bg: "red" });
});

test("settings writes reject mixed grants, unknown keys and global appearance for an appearance-only user", () => {
  assert.equal(writableSettings({ outlook_mcp_config: "{}" }, ["settings.appearance"]), false);
  assert.equal(writableSettings({ app_font_size: "15" }, ["settings.appearance"]), false);
  assert.equal(writableSettings({ app_font_size: "15" }, ["settings.general"]), true);
  assert.equal(writableSettings({ ai_instruction_glpi: "x", exchange_pass: "x" }, ["settings.ai"]), false);
  assert.equal(writableSettings({ arbitrary_key: "x" }, ["settings.general"]), false);
});

test("Master Data writes, connection tests, template changes and Audit reject direct requests without grants", async () => {
  await serve(["settings.appearance"], async (url) => {
    for (const [method, path] of [["POST", "/api/admin/people"], ["POST", "/api/admin/group-emails"], ["POST", "/api/admin/systems/test-connection"], ["POST", "/api/admin/docx-templates/single/reset"], ["GET", "/api/audit-logs"]]) {
      const response = await fetch(url + path, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
    const denied = await fetch(url + "/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchange_pass: "secret" }) });
    assert.equal(denied.status, 403);
  });
});
