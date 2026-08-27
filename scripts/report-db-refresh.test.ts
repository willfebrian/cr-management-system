import assert from "node:assert/strict";
import test from "node:test";
import { startReportDbRefresh } from "../src/client/reportDbRefresh";

test("refreshes the Report database data immediately when the Report opens", () => {
  let refreshes = 0;

  const stop = startReportDbRefresh(() => {
    refreshes += 1;
  }, 60_000);

  assert.equal(refreshes, 1);
  stop();
});
