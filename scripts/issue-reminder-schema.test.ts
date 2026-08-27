import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("persists the reminder role and sent reminder history", () => {
  const schema = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");
  const migrationPath = new URL("../database/migrations/20260827_issue_reminder_email.sql", import.meta.url);

  assert.match(schema, /is_reminder BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS issue_reminder_emails/);
  assert.equal(existsSync(migrationPath), true);
  const migration = readFileSync(migrationPath, "utf8");
  assert.match(migration, /ALTER TABLE issue_people\s+ADD COLUMN IF NOT EXISTS is_reminder/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS issue_reminder_emails/);
});
