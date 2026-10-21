import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { pool } from "../src/server/db/pool.js";
import { createOrGetActiveReleaseOperation, findReleaseOperation, updateReleaseOperation } from "../src/server/sap/transportReleaseOperationRepository.js";

test("application connections exclude public fallback", () => {
  assert.equal(pool.options.options, `-c search_path=${process.env.PGSCHEMA || "cr_management"}`);
});

test("release operations read and write only the selected schema", { skip: process.env.SCHEMA_ISOLATION_TEST !== "true" }, async () => {
  const client = await pool.connect();
  const prefix = `schema_test_${randomBytes(6).toString("hex")}`;
  const schemas = [`${prefix}_a`, `${prefix}_b`];
  const query = (sql: string, params: unknown[]) => client.query(sql, params);
  try {
    await client.query("BEGIN");
    for (const [i, schema] of schemas.entries()) {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      await client.query(readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8"));
      await client.query(readFileSync(new URL("../database/migrations/20260821_release_operations.sql", import.meta.url), "utf8"));
      await client.query("INSERT INTO release_operations(id,trkorr,target_system) VALUES (42,$1,'DEV_AIX')", [`FIXTURE_${i}`]);
    }
    for (const [i, schema] of schemas.entries()) {
      await client.query(`SET LOCAL search_path TO ${schema}`);
      assert.equal((await findReleaseOperation("42", query))?.trkorr, `FIXTURE_${i}`);
      await updateReleaseOperation("42", { status: "failed", message: `Updated ${i}` }, query);
      const created = await createOrGetActiveReleaseOperation({ trkorr: `NEW_${i}`, targetSystem: "DEV_AIX" }, query);
      assert.equal(created.trkorr, `NEW_${i}`);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM release_operations")).rows[0].n, 2);
    }
    await client.query(`SET LOCAL search_path TO ${schemas[0]}`);
    assert.equal((await findReleaseOperation("42", query))?.message, "Updated 0");
    await client.query(`SET LOCAL search_path TO ${prefix}_missing`);
    await assert.rejects(findReleaseOperation("42", query), (error: any) => error.code === "42P01");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
