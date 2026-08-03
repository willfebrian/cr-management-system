import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../database/migrations/20260731_project_go_live.sql", import.meta.url), "utf8");

test("defines all Project tables and status contracts", () => {
  for (const table of [
    "project_headers",
    "project_issue_links",
    "project_issue_link_history",
    "project_status_history"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  for (const status of ["planned", "in_progress", "on_hold", "completed", "cancelled"]) {
    assert.match(sql, new RegExp(`'${status}'`, "i"));
  }
  for (const relation of ["active", "removed", "cancelled", "deleted"]) {
    assert.match(sql, new RegExp(`'${relation}'`, "i"));
  }
});

test("enforces one active Project per Issue and preserves history references", () => {
  assert.match(sql, /UNIQUE\s*\(issue_id\)/i);
  assert.match(sql, /project_issue_link_history[\s\S]+project_id[\s\S]+ON DELETE SET NULL/i);
  assert.match(sql, /project_issue_link_history[\s\S]+issue_id[\s\S]+ON DELETE SET NULL/i);
  assert.match(sql, /project_status_history[\s\S]+project_id[\s\S]+ON DELETE SET NULL/i);
});

test("uses issue_people for owners and app_users for audit actors", () => {
  assert.match(sql, /owner_person_id[\s\S]+REFERENCES issue_people\(id\)/i);
  for (const actorColumn of [
    "created_by_user_id",
    "updated_by_user_id",
    "cancelled_by_user_id",
    "linked_by_user_id",
    "changed_by_user_id"
  ]) {
    assert.match(sql, new RegExp(`${actorColumn}[\\s\\S]+REFERENCES app_users\\(id\\)`, "i"));
  }
});

test("creates Project lookup and history indexes without seeding prototype rows", () => {
  for (const index of [
    "idx_project_headers_status",
    "idx_project_headers_owner",
    "idx_project_issue_link_history_project",
    "idx_project_issue_link_history_issue",
    "idx_project_status_history_project"
  ]) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS ${index}`, "i"));
  }
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+project_headers/i);
});
