import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../database/migrations/20260731_user_management_lifecycle.sql",
  import.meta.url
);

test("migration adds complete soft-archive metadata to app_users", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const column of [
    "deleted_at TIMESTAMPTZ",
    "deleted_by_user_id BIGINT",
    "deleted_by_snapshot TEXT",
    "delete_reason TEXT"
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${column}`, "i"));
  }
  assert.match(sql, /deleted_by_user_id[\s\S]+REFERENCES app_users\s*\(id\)\s+ON DELETE SET NULL/i);
});

test("migration creates permanent normalized username reservations", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_user_usernames/i);
  assert.match(sql, /normalized_username TEXT PRIMARY KEY/i);
  assert.match(sql, /user_id BIGINT NOT NULL REFERENCES app_users\s*\(id\)/i);
  assert.match(sql, /changed_by_user_id BIGINT REFERENCES app_users\s*\(id\)\s+ON DELETE SET NULL/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]+ON app_user_usernames\s*\(user_id\)[\s\S]+WHERE is_current/i);
});

test("migration idempotently backfills one current reservation for existing users", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /INSERT INTO app_user_usernames/i);
  assert.match(sql, /upper\s*\(\s*trim\s*\(\s*u\.username\s*\)\s*\)/i);
  assert.match(sql, /ON CONFLICT\s*\(normalized_username\)\s+DO NOTHING/i);
  assert.match(sql, /NOT EXISTS[\s\S]+existing\.user_id = u\.id[\s\S]+existing\.is_current/i);
});
