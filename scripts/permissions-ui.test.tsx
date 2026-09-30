import React from "react";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { can, canOpenView, firstAccessibleView } from "../src/client/permissions";
import { UserPermissionsPanel, togglePermission } from "../src/client/components/users/UserPermissionsPanel";
import type { AuthUser } from "../src/client/api";

function user(role: "ADMIN" | "USER", permissions: AuthUser["permissions"]): AuthUser {
  return { id: 1, username: "TEST", role, permissions, mustChangePassword: false, isReminder: false };
}

test("navigation honors explicit grants, including independent transport actions", () => {
  const account = user("USER", ["issue.view", "transport.create"]);
  assert.equal(canOpenView(account, "issue-display"), true);
  assert.equal(canOpenView(account, "cr-transport-create"), true);
  assert.equal(canOpenView(account, "cr-transport-release"), false);
  assert.equal(canOpenView(account, "dashboard"), false);
  assert.equal(firstAccessibleView(account), "cr-transport-create");
  assert.equal(firstAccessibleView(user("USER", [])), null);
});

test("regular users cannot use admin-only Issue reference grant even if malformed account data contains it", () => {
  assert.equal(can(user("USER", ["issue.cr_references"]), "issue.cr_references"), false);
  assert.equal(can(user("ADMIN", ["issue.cr_references"]), "issue.cr_references"), true);
  assert.equal(can(user("USER", ["issue.helpdesk_references"]), "issue.helpdesk_references"), true);
});

test("checkbox selection adds requirements and parent removal clears dependent actions", () => {
  const withTicket = togglePermission([], "issue.create_glpi_ticket", true, "USER");
  assert.deepEqual(withTicket, ["issue.view", "issue.generate_glpi_template", "issue.create_glpi_ticket"]);
  assert.deepEqual(togglePermission(withTicket, "issue.generate_glpi_template", false, "USER"), ["issue.view"]);
  const withTransport = togglePermission([], "transport.create", true, "USER");
  assert.deepEqual(withTransport, ["transport.create"]);
});

test("permission editor renders independent Issue and transport checkboxes", () => {
  const html = renderToStaticMarkup(<UserPermissionsPanel role="ADMIN" value={["issue.helpdesk_references"]} onChange={() => {}} />);
  for (const label of ["Create Transport", "Release Transport", "Manage CR SAP References", "Manage GLPI References", "Manage CR Helpdesk Numbers", "Generate Confirmation Email", "Generate GLPI Ticket Template", "Open Create Ticket in GLPI", "Generate CR Transport Form", "Generate CR User Form", "Send Reminder Email"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /checked=""/);
});

test("checkboxes keep grants independent and disable ADMIN-only references for USER", () => {
  const html = renderToStaticMarkup(<UserPermissionsPanel role="USER" value={["transport.create", "issue.helpdesk_references"]} onChange={() => {}} />);
  const checkedKeys = [...html.matchAll(/<input[^>]*data-permission="([^"]+)"[^>]*checked=""/g)].map((match) => match[1]);
  assert.deepEqual(checkedKeys, ["transport.create", "issue.helpdesk_references"]);
  assert.match(html, /data-permission="issue\.cr_references"[^>]*disabled=""/);
  assert.match(html, /data-permission="issue\.glpi_references"[^>]*disabled=""/);
});

test("Issue references, Create-and-link, output actions, 403 refresh and empty-access landing follow permissions", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/client/api.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/client/components/users/UserManagementWorkspace.tsx", import.meta.url), "utf8");
  for (const key of ["issue.cr_references", "issue.glpi_references", "issue.helpdesk_references"]) {
    assert.ok(app.includes(`!canIssue("${key}")`), `${key} must make its Issue input read-only`);
  }
  assert.match(app, /canIssue\("transport\.create"\) && canIssue\("issue\.cr_references"\)/, "Create-and-link requires both grants");
  for (const key of ["issue.generate_email", "issue.generate_glpi_template", "issue.generate_cr_transport_form", "issue.generate_cr_user_form", "issue.reminder"]) {
    assert.ok(app.includes(`canIssue("${key}")`), `${key} controls its Issue output action`);
  }
  assert.match(app, /canIssue\("issue\.create_glpi_ticket"\) && canIssue\("issue\.generate_glpi_template"\)/);
  assert.match(api, /response\.status === 403[\s\S]*permissions-changed/);
  assert.match(workspace, /dispatchEvent\(new Event\("permissions-changed"\)\)/);
  assert.match(app, /if \(!firstAccessibleView\(authUser\)\)[\s\S]*Access limited[\s\S]*Logout[\s\S]*Change password/);
});

test("Create success returns to a view the account is allowed to open", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  assert.equal((app.match(/setView\(canOpenView\(authUser, "issue-change"\) \? "issue-change" : "issue-display"\)/g) || []).length, 2);
  assert.match(app, /setView\(canOpenView\(authUser, "project-change"\) \? "project-change" : "project-report"\)/);
});
