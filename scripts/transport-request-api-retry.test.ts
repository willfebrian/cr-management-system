import assert from "node:assert/strict";
import test from "node:test";
import { resolveTransportObject } from "../src/client/api/transportRequestApi";

test("resolve retries once when authentication database connection times out", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return response(500, { ok: false, message: "connect ETIMEDOUT 192.168.1.232:5432" });
    }
    return response(200, { ok: true, message: "RESOLVE_OK", rows: [] });
  }) as typeof fetch;

  try {
    const result = await resolveTransportObject("ZZKMK");
    assert.equal(result.message, "RESOLVE_OK");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolve hides low-level connection details after its retry is exhausted", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => response(500, {
    ok: false,
    message: "connect ETIMEDOUT 192.168.1.232:5432"
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveTransportObject("ZZKMK"),
      /Database sementara tidak dapat dihubungi\. Silakan coba kembali\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}
