import assert from "node:assert/strict";
import test from "node:test";
import { transportObjectLabel } from "../src/shared/transportObjectLabels.js";

test("uses verified pair descriptions ahead of stale historical labels", () => {
  const label = transportObjectLabel as (pgmid: string, objectType: string, savedLabel?: string) => string;
  assert.equal(label("LIMU", "REPS", "Source/include ABAP"), "Report Source Code");
  assert.equal(label("R3TR", "SSFO"), "SAP Smart Form");
  assert.equal(label("R3TR", "SSST"), "SAP Smart Style");
  assert.equal(label("R3TR", "FORM"), "SAPscript Form");
  assert.equal(label("LIMU", "TABD"), "Table Definition");
  assert.equal(label("R3TR", "PROG"), "Program");
  assert.equal(label("LIMU", "ZZZZ", "Historical description"), "Historical description");
  assert.equal(label("LIMU", "PROG"), "SAP transport object (LIMU PROG)");
});
