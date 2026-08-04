import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, styles, api, authService, authRoutes, crRepository, projectActions] = await Promise.all([
  readFile(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/client/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../src/client/api.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server/auth/authService.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server/routes/authRoutes.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/server/db/crRepository.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/client/components/projects/ProjectActions.tsx", import.meta.url), "utf8"),
]);

assert.match(crRepository, /ORDER BY\s+trkorr DESC/i, "CR Transport report must sort by TRKORR descending");
assert.match(authService, /lastLoginAt/, "Auth service must expose lastLoginAt");
assert.match(authRoutes, /lastLoginAt/, "Auth response must expose lastLoginAt");
assert.match(api, /lastLoginAt/, "Frontend auth contract must expose lastLoginAt");
assert.match(app, /CR Transport/, "Navigation must use the CR Transport label");
assert.match(app, /VIEW_META/, "Pages must use centralized title and description metadata");
for (const view of ["dashboard", "report", "issue-display", "issue-create", "issue-change", "user-management", "project-report", "project-create", "project-change"]) {
  assert.match(app, new RegExp(`["']?${view}["']?\\s*:`), `VIEW_META must describe ${view}`);
}
const dashboardIndex = app.indexOf("<BarChart3 size={18} /> Dashboard");
const transportIndex = app.indexOf("<FileSearch size={18} /> CR Transport");
const issueIndex = app.indexOf("<ClipboardList size={18} /> Issue");
const projectIndex = app.indexOf("<FolderKanban size={18} /> Project");
const userManagementIndex = app.indexOf("<Users size={18} /> User Management");
assert.ok(
  dashboardIndex >= 0
    && dashboardIndex < transportIndex
    && transportIndex < issueIndex
    && issueIndex < projectIndex
    && projectIndex < userManagementIndex,
  "Sidebar order must be Dashboard, CR Transport, Issue, Project, User Management",
);
assert.match(app, /LogOut/, "Logout action must use an icon");
assert.match(app, /Last login:/i, "Sidebar footer must show last login");
assert.match(projectActions, /Cancel Project/, "Project actions must expose cancellation");
assert.match(projectActions, /Delete Project/, "Project actions must expose admin deletion");
assert.match(projectActions, /Generate CR Transport/, "Project actions must expose Project CR Transport generation");
assert.match(projectActions, /CR Transport Project belum dapat dibuat/, "Incomplete Project data must open a blocking readiness dialog");
assert.doesNotMatch(app, /prototype-note/, "Project report must not show prototype-only UI");
assert.doesNotMatch(app, /project-page-heading/, "Project pages must not duplicate the shared page heading");
for (const control of ["Source Systems", "Sync Mode", "Lookback Days", "Sync CR"]) {
  assert.match(app, new RegExp(control), `${control} control must remain available`);
}
assert.match(
  styles,
  /\.phase-title\s*>\s*div\s*\{[^}]*flex:\s*1\b/is,
  "Phase title copy must consume remaining space so headings stay left-aligned",
);

console.log("Navigation, authentication metadata, and CR sorting regression checks passed.");
