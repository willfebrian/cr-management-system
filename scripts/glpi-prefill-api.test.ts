import assert from "node:assert/strict";
import test from "node:test";
import { fetchGlpiPrefillActors } from "../src/client/api.js";

test("loads the GLPI actor mapping for the saved Issue", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ requesterGlpiUserIds: [77], abaperGlpiUserIds: [88] });
  };
  try {
    assert.deepEqual(await fetchGlpiPrefillActors(17), { requesterGlpiUserIds: [77], abaperGlpiUserIds: [88] });
    assert.equal(calls[0]?.url, "/api/issues/17/glpi-prefill-actors");
    assert.equal(calls[0]?.init?.credentials, "include");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
