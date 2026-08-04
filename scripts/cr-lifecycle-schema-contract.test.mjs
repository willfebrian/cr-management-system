import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../database/migrations/20260804_transport_lifecycle_step.sql", import.meta.url),
  "utf8"
).catch(() => "");
const schema = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");

test("adds an auditable transport step and guards confirmed imports", () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS transport_step TEXT/i);
    assert.match(sql, /chk_cr_transport_lifecycle_confirmed_step/i);
    assert.match(sql, /transport_status\s*<>\s*'imported'[\s\S]+evidence_source\s*=\s*'confirmed'[\s\S]+transport_step\s*=\s*'I'/i);
    assert.match(sql, /NOT VALID/i);
  }
});

test("backfills legacy TPALOG step messages", () => {
  assert.match(migration, /Confirmed from TPALOG step/i);
  assert.match(migration, /regexp_match/i);
});
