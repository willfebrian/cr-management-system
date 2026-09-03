import assert from "node:assert/strict";
import test from "node:test";

import { databaseConnectionMessage } from "../src/server/db/pool.js";

test("turns low-level database socket errors into an actionable message", () => {
  const message = databaseConnectionMessage(Object.assign(new Error("connect EACCES 192.168.1.232:5432"), { code: "EACCES" }), "192.168.1.232", 5432);
  assert.match(message, /Database is unreachable at 192\.168\.1\.232:5432/);
  assert.match(message, /network, VPN, firewall, and PostgreSQL service/i);
  assert.doesNotMatch(message, /password/i);
});
