import assert from "node:assert/strict";
import test from "node:test";
import { TransportRequestGuard } from "../mcp/sap/transport-request-guard.mjs";

function guard() {
  return new TransportRequestGuard({
    target: { server: "SAP_DEV_AIX", client: "130", sapUser: "TRSTDEV", package: "ZTRD" },
    confirmationService: { verifyAndConsume() {} }
  });
}

test("allows a function module sub-object resolved as LIMU FUNC", () => {
  const result = guard().authorize({
    server: "SAP_DEV_AIX", client: "130", sapUser: "TRSTDEV", mode: "PREFLIGHT",
    description: "AB - Update ZMM_MD_DL", objects: [{ pgmid: "LIMU", objectType: "FUNC", objectName: "ZMM_MD_DL", sourcePackage: "$TMP", targetPackage: "ZTRD" }]
  });
  assert.equal(result.objects[0].objectType, "FUNC");
});
