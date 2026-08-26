import assert from "node:assert/strict";
import test from "node:test";

test("resolves Requester and ABAPer GLPI users from their Issue participant roles", async () => {
  let imported: Record<string, unknown> | undefined;
  try {
    imported = await import("../src/server/services/glpiPrefillActorService.js");
  } catch {}
  const resolveGlpiPrefillActors = imported?.resolveGlpiPrefillActors;
  assert.equal(typeof resolveGlpiPrefillActors, "function", "GLPI actor resolver must exist");

  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const database = {
    async query(sql: string, params: unknown[]) {
      queries.push({ sql, params });
      return {
        rows: [
          { role: "requester", email: "requester@trst.co.id" },
          { role: "abaper", email: "abaper@trst.co.id" }
        ]
      };
    }
  };
  const lookups: string[][] = [];
  const lookup = async (emails: string[]) => {
    lookups.push(emails);
    return emails[0] === "requester@trst.co.id" ? [77] : [88];
  };

  const result = await (resolveGlpiPrefillActors as Function)(17, database, lookup);

  assert.deepEqual(result, { requesterGlpiUserIds: [77], abaperGlpiUserIds: [88] });
  assert.match(queries[0]?.sql || "", /participant\.role IN \('requester', 'abaper'\)/);
  assert.deepEqual(queries[0]?.params, [17]);
  assert.deepEqual(lookups, [["requester@trst.co.id"], ["abaper@trst.co.id"]]);
});
