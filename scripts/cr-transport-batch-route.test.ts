import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeBatchIssueIds } from "../src/server/routes/crRoutes.js";

test("normalizes unique positive issue IDs for a batch request", () => {
  assert.deepEqual(normalizeBatchIssueIds([101, "101", 0, -2, "bad", 102.5, 103]), [101, 103]);
});

test("registers the CR transport batch ZIP route", () => {
  const routes = readFileSync(new URL("../src/server/routes/crRoutes.ts", import.meta.url), "utf8");
  assert.match(routes, /crRoutes\.post\("\/issues\/templates\/cr-transport\/batch"/);
  assert.match(routes, /application\/zip/);
  assert.match(routes, /download_cr_transport_forms_batch/);
});
