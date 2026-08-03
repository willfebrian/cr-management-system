import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [app, main, server, authService, issueRepository, schema, packageJson] =
  await Promise.all([
    read("src/client/pages/App.tsx"),
    read("src/client/main.tsx"),
    read("src/server/index.ts"),
    read("src/server/auth/authService.ts"),
    read("src/server/db/issueRepository.ts"),
    read("database/schema.sql"),
    read("package.json")
  ]);

assert.match(app, /UserManagementWorkspace/);
assert.match(app, /ProjectReport/);
assert.match(app, /ProjectEditor/);
assert.doesNotMatch(app, /function UserManagement\(/);
assert.doesNotMatch(app, /projectMockData|function ProjectPrototype\(/);
assert.doesNotMatch(app, /Generate Project CR Form/);

assert.match(main, /styles\/project\.css/);
assert.match(main, /styles\/user-management\.css/);

assert.match(server, /projectRoutes/);
assert.match(
  server,
  /app\.use\(["']\/api\/projects["'],\s*projectRoutes\)/
);
assert.match(server, /GET,POST,PUT,PATCH,DELETE,OPTIONS/);

assert.match(authService, /deleted_at IS NULL/i);
assert.match(issueRepository, /findActiveProjectForIssue/);
assert.match(issueRepository, /ISSUE_PROJECT_CONFLICT/);

assert.equal(
  (schema.match(/CREATE TABLE IF NOT EXISTS app_users\s*\(/g) || []).length,
  1,
  "canonical schema must define app_users exactly once"
);
assert.match(schema, /CREATE TABLE IF NOT EXISTS app_user_usernames/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS project_headers/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS project_issue_links/);

const scripts = JSON.parse(packageJson).scripts;
assert.match(Object.values(scripts).join(" "), /project-user-management-integration\.test\.mjs/);

console.log("Project and User Management integration contracts passed.");
