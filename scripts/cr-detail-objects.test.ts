import assert from "node:assert/strict";
import test from "node:test";
import { summarizeTransportObjects } from "../src/client/components/crTransport/crDetailObjects";

test("combines parent and task occurrences while retaining source records and separating release entries", () => {
  const objects = [
    { trkorr: "P", position: "1", pgmid: "R3TR", object_type: "SSFO", object_name: "FORM" },
    { trkorr: "T", position: "2", pgmid: "R3TR", object_type: "SSFO", object_name: "FORM" },
    { trkorr: "P", position: "3", pgmid: "CORR", object_type: "RELE", object_name: "RELEASE" },
    { trkorr: "P", position: "4", pgmid: "LIMU", object_type: "SSFO", object_name: "FORM" }
  ];
  const result = summarizeTransportObjects(objects);
  assert.equal(result.objects.length, 2);
  assert.deepEqual(result.objects[0].sources, objects.slice(0, 2));
  assert.deepEqual(result.releaseEntries, [objects[2]]);
  assert.equal(result.sourceCount, 3);
  assert.equal(objects.length, 4);
});

test("does not collapse unnamed inventory records", () => {
  const result = summarizeTransportObjects([
    { trkorr: "P", position: "1", pgmid: "R3TR", object_type: "TABU" },
    { trkorr: "P", position: "2", pgmid: "R3TR", object_type: "TABU" }
  ]);
  assert.equal(result.objects.length, 2);
});
