import assert from "node:assert/strict";
import test from "node:test";
import { findGlpiUserIdsByEmails } from "../src/server/db/glpiMariaRepository.js";

test("resolves active GLPI users through glpi_useremails using normalized addresses", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    async query(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      return [[{ user_id: 88 }, { user_id: 91 }], []];
    }
  };

  const ids = await findGlpiUserIdsByEmails(
    [" ABAPER@TRST.CO.ID ", "abaper@trst.co.id", "second@trst.co.id", ""],
    db
  );

  assert.deepEqual(ids, [88, 91]);
  assert.match(calls[0]?.sql || "", /glpi_useremails/);
  assert.match(calls[0]?.sql || "", /is_active/);
  assert.deepEqual(calls[0]?.params, [["abaper@trst.co.id", "second@trst.co.id"]]);
});

test("does not query GLPI when the Issue has no ABAPer email", async () => {
  let queried = false;
  const ids = await findGlpiUserIdsByEmails([], {
    async query() {
      queried = true;
      return [[], []];
    }
  });

  assert.deepEqual(ids, []);
  assert.equal(queried, false);
});
