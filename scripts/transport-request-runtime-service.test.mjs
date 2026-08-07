import assert from "node:assert/strict";
import test from "node:test";
import { TransportRequestService } from "../mcp/sap/transport-request-service.mjs";

test("bundled transport service resolves objects through the selected DEV AIX target", async () => {
  const previousSecret = process.env.SAP_ABAP_ACTION_APPROVAL_SECRET;
  delete process.env.SAP_ABAP_ACTION_APPROVAL_SECRET;
  const calls = [];
  const client = {
    async call(name, params) {
      calls.push({ name, params });
      return {
        EV_SUCCESS: "X",
        EV_MESSAGE: "RESOLVE_OK",
        ET_RESULTS: [{ LINE: "R3TR|PROG|ZFII_MAINTAIN_KMK|$TMP|||" }]
      };
    }
  };
  const service = new TransportRequestService({
    targetSystem: "DEV_AIX",
    client,
    auditLogger: { write() {} }
  });

  try {
    const result = await service.resolve("ZFII_MAINTAIN_KMK");

    assert.equal(service.target.server, "SAP_DEV_AIX");
    assert.equal(service.target.client, "130");
    assert.equal(service.target.sapUser, "TRSTDEV");
    assert.equal(calls[0].name, "ZRFC_TRANSPORT_OBJECT_RESOLVE");
    assert.equal(result.rows[0].objectName, "ZFII_MAINTAIN_KMK");
    assert.equal(result.rows[0].targetPackage, "ZTRD");
  } finally {
    if (previousSecret === undefined) delete process.env.SAP_ABAP_ACTION_APPROVAL_SECRET;
    else process.env.SAP_ABAP_ACTION_APPROVAL_SECRET = previousSecret;
  }
});

test("bundled transport service accepts a database-backed target through scoped runtime configuration", async () => {
  const env = { SAP_CR_TARGET_CODE: "TRS", SAP_CR_TARGET_SERVER: "TRS", SAP_CR_TARGET_CLIENT: "130", SAP_CR_TARGET_USER: "TRSTDEV", SAP_CR_TARGET_PACKAGE: "ZTRD" };
  const service = new TransportRequestService({ targetSystem: "TRS", env, client: {}, auditLogger: { write() {} } });
  assert.equal(service.target.code, "TRS");
  assert.equal(service.target.client, "130");
});
