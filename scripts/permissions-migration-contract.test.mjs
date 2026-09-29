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


