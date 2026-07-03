import fs from "node:fs";

const REQUIRED_DEV_SERVERS = new Set(["SAP_DEV_AIX", "SAP_DEV_NC"]);

export function loadAbapChangePolicy(policyPath = "config/abap-backup-change-policy.json") {
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const allowedServers = new Set(policy.allowedServers || []);
  for (const server of REQUIRED_DEV_SERVERS) {
    if (!allowedServers.has(server)) throw new Error(`ABAP change policy must allow ${server}`);
  }
  if (allowedServers.has("SAP_QA") || allowedServers.has("SAP_PRD")) {
    throw new Error("ABAP change policy must not allow SAP_QA or SAP_PRD");
  }
  if (policy.signedConfirmationRequired !== true || policy.oneTimeConfirmationRequired !== true) {
    throw new Error("ABAP change policy must require signed one-time confirmation");
  }
  if (policy.localObjectOnly !== true || policy.requiredLocalPackage !== "$TMP") {
    throw new Error("ABAP change policy must require Local Object ($TMP)");
  }
  if (policy.transportAllowed !== false || policy.requestOrCrCreationAllowed !== false) {
    throw new Error("ABAP change policy must prohibit Request/CR creation and transports");
  }
  return policy;
}
