import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const inventory = {
  "moduleRoutes.ts": [["get", "/admin/modules", "master_data.view"], ["post", "/admin/modules", "master_data.modules"], ["put", "/admin/modules/:id", "master_data.modules"], ["get", "/value-help/modules", "issue.view"], ["get", "/value-help/modules/report", "issue.view"]],
  "crRoutes.ts": [
    ["get", "/health", "public liveness endpoint"], ["get", "/systems", "dashboard.view transport.view transport.create transport.release"],
    ["get", "/cr/export", "transport.export"], ["get", "/issues/export", "issue.export"],
    ["get", "/dashboard", "dashboard.view"], ["get", "/dashboard/status-trend", "dashboard.view"],
    ["get", "/cr", "transport.view"], ["get", "/cr/:trkorr", "transport.view"],
    ["get", "/issues", "issue.view"], ["get", "/issues/status-options", "issue.view"],
    ["get", "/issues/next-number", "issue.create"], ["get", "/issues/next-sub-issue", "issue.create"],
    ["get", "/value-help/people", "issue.view"], ["post", "/value-help/people/validate", "issue.view"],
    ["post", "/value-help/people", "master_data.people"], ["get", "/value-help/glpi", "issue.view"],
    ["get", "/value-help/glpi/:id", "issue.view"], ["get", "/value-help/cr-helpdesk", "issue.view"],
    ["get", "/value-help/cr", "issue.view"], ["get", "/issues/:id", "issue.view"],
    ["get", "/issues/:id/reminder-preview", "issue.reminder"], ["post", "/issues/:id/reminder", "issue.reminder"],
    ["post", "/issues/:id/reminder-ai-draft", "issue.reminder"], ["get", "/issues/:id/glpi-prefill-actors", "issue.create_glpi_ticket"],
    ["get", "/issues/:id/templates/cr-transport", "issue.generate_cr_transport_form"],
    ["post", "/issues/templates/cr-transport/batch", "issue.generate_cr_transport_form"],
    ["get", "/issues/:id/templates/cr-user", "issue.generate_cr_user_form"],
    ["get", "/issues/:id/templates/:kind", "issue.generate_email issue.generate_glpi_template issue.reminder"],
    ["post", "/issues", "issue.create"], ["put", "/issues/:id", "issue.edit"],
    ["post", "/issues/:id/cancel", "issue.cancel_delete"], ["delete", "/issues/:id", "issue.cancel_delete"],
    ["post", "/sync/cr", "transport.sync"]
  ],
  "projectRoutes.ts": [
    ["get", "/", "project.view"], ["get", "/issue-options", "project.view"], ["get", "/owner-options", "project.view"],
    ["get", "/:id/cr-transport-readiness", "project.documents"], ["get", "/:id/cr-transport-document", "project.documents"],
    ["get", "/:id", "project.view"], ["post", "/", "project.create project.edit"], ["put", "/:id", "project.edit"],
    ["post", "/:id/cancel", "project.cancel_delete"], ["delete", "/:id", "project.cancel_delete"]
  ],
  "adminRoutes.ts": [
    ["get", "/people", "master_data.view"], ["post", "/people", "master_data.people"], ["put", "/people/:id", "master_data.people"],
    ["delete", "/people/:id", "master_data.people"], ["get", "/group-emails", "master_data.view"],
    ["post", "/group-emails", "master_data.group_emails"], ["put", "/group-emails/:id", "master_data.group_emails"],
    ["delete", "/group-emails/:id", "master_data.group_emails"], ["get", "/settings", "settings"], ["put", "/settings", "settings"],
    ["get", "/docx-templates/info", "settings.templates"], ["get", "/docx-templates/:type/download", "settings.templates"],
    ["post", "/docx-templates/:type/upload", "settings.templates"], ["post", "/docx-templates/:type/reset", "settings.templates"],
    ["get", "/systems", "settings.target_systems transport.create transport.release"], ["post", "/systems", "settings.target_systems"],
    ["put", "/systems/:id", "settings.target_systems"], ["delete", "/systems/:id", "settings.target_systems"],
    ["post", "/systems/test-connection", "settings.target_systems"]
  ],
  "aiRoutes.ts": [["post", "/generate-analysis", "issue.edit"], ["post", "/test-connection", "settings.ai"]],
  "outlookRoutes.ts": [["get", "/search-email", "issue.view"], ["post", "/test-mcp-connection", "settings.general"]],
  "auditRoutes.ts": [["get", "/audit-logs", "audit.view"]],
  "transportRequestRoutes.ts": [["post", "/resolve-object", "transport.create"], ["post", "/preflight", "transport.create"], ["post", "/create", "transport.create"]],
  "transportReleaseRoutes.ts": [["get", "/candidates", "transport.release"], ["post", "/test-run", "transport.release"], ["post", "/operations", "transport.release"], ["get", "/operations/:id", "transport.release"], ["post", "/execute", "transport.release"]],
  "userRoutes.ts": [
    ["get", "/", "users.view"], ["get", "/person-options", "users.view"], ["put", "/:id/person", "users.manage"],
    ["delete", "/:id/person", "users.manage"], ["get", "/:id/audit", "users.view"], ["put", "/:id/permissions", "users.manage"],
    ["post", "/", "users.manage"], ["patch", "/:id/profile", "users.manage"], ["patch", "/:id/status", "users.manage"],
    ["patch", "/:id/password", "users.manage"], ["post", "/:id/revoke-sessions", "users.manage"],
    ["delete", "/:id", "users.manage"], ["post", "/:id/restore", "users.manage"]
  ]
};

test("all feature routers have an authentication boundary", () => {
  const index = read("../src/server/index.ts");
  for (const name of ["userRoutes", "adminRoutes", "outlookRoutes", "aiRoutes", "auditRoutes", "transportReleaseRoutes", "transportRequestRoutes", "crRoutes"]) {
    assert.match(index, new RegExp(`app\\.use\\(\"/api[^\"]*\",\\s*requireAuth,\\s*${name}\\)`), `${name} requires authentication`);
  }
  assert.match(read("../src/server/routes/projectRoutes.ts"), /routes\.use\(dependencies\.requireAuth\)/);
});

test("inventory lists every route and checks the permission assigned to it", () => {
  for (const [file, entries] of Object.entries(inventory)) {
    const source = read(`../src/server/routes/${file}`);
    const prefix = ["projectRoutes.ts", "moduleRoutes.ts"].includes(file) ? "routes" : file === "userRoutes.ts" ? "router" : file.replace("Routes.ts", "Routes");
    const declarations = [...source.matchAll(new RegExp(`${prefix}\\.(?:get|post|put|patch|delete)\\(`, "g"))];
    assert.equal(declarations.length, entries.length, `${file} route inventory is complete`);
    for (const [method, path, decision] of entries) {
      const signature = `${prefix}.${method}("${path}"`;
      const start = source.indexOf(signature);
      assert.ok(start >= 0, `missing ${method.toUpperCase()} ${path} in ${file}`);
      if (decision === "public liveness endpoint") continue;
      if (file === "userRoutes.ts") {
        assert.match(source, /router\.use\(requireAdmin\)/);
        assert.match(source, /req\.method === "GET" \? "users\.view" : "users\.manage"/);
        continue;
      }
      if (file === "transportRequestRoutes.ts") { assert.match(source, /transportRequestRoutes\.use\(requirePermission\("transport\.create"\)\)/); continue; }
      if (file === "transportReleaseRoutes.ts") { assert.match(source, /transportReleaseRoutes\.use\(requirePermission\("transport\.release"\)\)/); continue; }
      const snippet = source.slice(start, start + 1100);
      if (file === "adminRoutes.ts" && decision === "settings") {
        assert.match(snippet, /visibleSettings|writableSettings/);
        continue;
      }
      if (file === "adminRoutes.ts" && path === "/systems") {
        assert.match(snippet, /settings\.target_systems|transport\.create|transport\.release/);
        continue;
      }
      if (file === "crRoutes.ts" && path === "/systems") {
        assert.match(snippet, /transport\.view|dashboard\.view|transport\.create|transport\.release/);
        continue;
      }
      for (const key of decision.split(" ")) assert.ok(snippet.includes(key), `${file} ${method.toUpperCase()} ${path} needs ${key}`);
    }
  }
});
