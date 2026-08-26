import assert from "node:assert/strict";
import test from "node:test";
import { searchOutlookEmail } from "../src/client/api.js";

test("Fetch Email uses only the authenticated MCP-backed application endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    await searchOutlookEmail("PI/PO change", 2, 15000);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(urls, ["/api/outlook/search-email?q=PI%2FPO+change&limit=2&maxChars=15000"]);
});
