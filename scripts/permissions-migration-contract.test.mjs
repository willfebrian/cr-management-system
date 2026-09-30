import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = new URL("../database/migrations/20260929_user_permissions.sql", import.meta.url);
const schemaPath = new URL("../database/schema.sql", import.meta.url);

test("migration contains idempotent grants with separate role defaults", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");
  for (const source of [sql, schema]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS app_user_permissions/i);
    assert.match(source, /PRIMARY KEY\s*\(user_id,\s*permission_key\)/i);
    assert.match(source, /ON CONFLICT\s*\(user_id,\s*permission_key\)\s*DO NOTHING/i);
    assert.match(source, /u\.deleted_at IS NULL/i);
    assert.match(source, /permissions_backfill_v1/i);
    assert.match(source, /'issue\.helpdesk_references'/i);
    assert.match(source, /'issue\.cr_references'/i);
    assert.match(source, /'issue\.glpi_references'/i);
    assert.match(source, /'issue\.generate_email'/i);
    assert.match(source, /'issue\.generate_glpi_template'/i);
    assert.match(source, /'issue\.generate_cr_transport_form'/i);
    assert.match(source, /'issue\.generate_cr_user_form'/i);
    assert.match(source, /'users\.manage'/i);
    assert.doesNotMatch(source.slice(source.indexOf("CREATE TABLE IF NOT EXISTS app_user_permissions")), /'transport\.create'|'transport\.release'/i);
  }
});

test("fresh database seed grants presets only to newly created accounts", () => {
  const seed = fs.readFileSync(new URL("../scripts/seed-auth-users.ts", import.meta.url), "utf8");
  assert.match(seed, /import \{ ADMIN_PRESET, REGULAR_USER_PRESET \} from "\.\.\/src\/shared\/permissions"/);
  assert.match(seed, /ON CONFLICT \(username\) DO NOTHING[\s\S]*?RETURNING id/);
  assert.match(seed, /if \(inserted\.rows\[0\] && account\)/);
  assert.match(seed, /role === "ADMIN" \? ADMIN_PRESET : REGULAR_USER_PRESET/);
  assert.match(seed, /INSERT INTO app_user_permissions[\s\S]*?ON CONFLICT \(user_id, permission_key\) DO NOTHING/);
  assert.match(seed, /await client\.query\("BEGIN"\)[\s\S]*await client\.query\("COMMIT"\)/);
  assert.doesNotMatch(seed, /"transport\.create"|"transport\.release"/);
  const catalog = fs.readFileSync(new URL("../src/shared/permissions.ts", import.meta.url), "utf8");
  assert.match(catalog, /key: "users\.manage"[^\n]*adminOnly: true/);
  assert.match(catalog, /export const ADMIN_PRESET[\s\S]*?PERMISSION_CATALOG/);
  assert.match(catalog.slice(catalog.indexOf("export const ADMIN_PRESET")), /definition\.key !== "transport\.create" && definition\.key !== "transport\.release"/);
});

test("fresh and existing account scenarios retain an active manager and no transport mutation by default", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const defaults = [...sql.matchAll(/\('([^']+)',\s*(true|false),\s*(true|false)\)/g)]
    .map(([, key, regular, admin]) => ({ key, regular: regular === "true", admin: admin === "true" }));
  const fromRole = (role) => defaults.filter((grant) => grant[role]).map((grant) => grant.key);
  const existing = [
    { role: "ADMIN", active: true, archived: false, grants: fromRole("admin") },
    { role: "USER", active: true, archived: false, grants: fromRole("regular") },
    { role: "ADMIN", active: false, archived: false, grants: fromRole("admin") },
    { role: "ADMIN", active: true, archived: true, grants: [] }
  ];
  const activeManager = existing.some((account) => account.role === "ADMIN" && account.active && !account.archived && account.grants.includes("users.manage"));
  assert.equal(activeManager, true);
  for (const account of existing) {
    assert.equal(account.grants.includes("transport.create"), false);
    assert.equal(account.grants.includes("transport.release"), false);
  }
  assert.deepEqual(existing[1].grants.filter((key) => ["issue.cr_references", "issue.glpi_references"].includes(key)), []);
  assert.equal(existing[3].grants.length, 0);
  const revoked = new Set(existing[0].grants.filter((key) => key !== "transport.sync"));
  const rerunWithMarker = sql.includes("permissions_backfill_v1") ? revoked : new Set([...revoked, ...fromRole("admin")]);
  assert.equal(rerunWithMarker.has("transport.sync"), false, "idempotent conflict and completion marker must preserve revoked grants");

  const seed = fs.readFileSync(new URL("../scripts/seed-auth-users.ts", import.meta.url), "utf8");
  assert.match(seed, /role === "ADMIN" \? ADMIN_PRESET : REGULAR_USER_PRESET/);
  assert.match(seed, /if \(inserted\.rows\[0\] && account\)/, "fresh-account grants are inserted after schema backfill already completed");
});


