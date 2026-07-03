import { assertSapServerEnabled, hasSapCapability, resolveSapServerName } from "./sap-landscape.mjs";

const DEFAULT_POLICY = {
  enabled: true,
  agent: "sap_abap_technical_agent",
  allowedServers: ["SAP_DEV_AIX", "SAP_DEV_AIX_MAINT", "SAP_DEV_NC", "SAP_DEV_NC_MAINT"],
  requireExplicitUserConfirmation: true,
  requireConfirmationId: true,
  maxConfirmationAgeMinutes: 30,
  localObjectOnly: true,
  requiredLocalPackage: "$TMP",
  requestOrCrCreationAllowed: false,
  allowedActions: [
    "edit_abap_source",
    "check_abap_program",
    "activate_abap_program",
    "execute_abap_report",
    "execute_transaction"
  ]
};

export class AbapChangeGuard {
  constructor(policy = DEFAULT_POLICY, confirmationService) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.confirmationService = confirmationService;
  }

  assertCanPerform({
    agentName,
    server,
    action,
    objectName,
    confirmation,
    parameters = {}
  }) {
    const normalizedAgent = normalize(agentName);
    const requestedServer = normalize(server);
    const normalizedServer = resolveSapServerName(requestedServer);
    const normalizedAction = String(action || "").trim().toLowerCase();
    const normalizedObject = normalize(objectName);

    if (!this.policy.enabled) throw denied("ABAP_CHANGE_DISABLED");
    assertSapServerEnabled(normalizedServer);
    if (normalizedAgent !== normalize(this.policy.agent)) throw denied("ABAP_AGENT_REQUIRED");
    if (!this.policy.allowedServers.map(resolveSapServerName).includes(normalizedServer) || !hasSapCapability(normalizedServer, "abap_maintenance")) {
      throw denied("ABAP_MAINTENANCE_SERVER_REQUIRED");
    }
    if (!this.policy.allowedActions.includes(normalizedAction)) throw denied("ACTION_NOT_ALLOWLISTED");
    if (!normalizedObject) throw denied("OBJECT_NAME_REQUIRED");
    assertLocalObjectPolicy(this.policy, normalizedAction, parameters);

    if (!this.confirmationService) throw denied("TRUSTED_CONFIRMATION_SERVICE_REQUIRED");
    const verified = this.confirmationService.verifyAndConsume(confirmation, {
      agentName: normalizedAgent,
      server: normalizedServer,
      action: normalizedAction,
      objectName: normalizedObject,
      parameters
    });

    return {
      agentName: normalizedAgent,
      server: normalizedServer,
      requestedServer,
      action: normalizedAction,
      objectName: normalizedObject,
      parameters,
      parameterHash: verified.parameterHash,
      confirmationId: verified.id,
      confirmedAt: verified.confirmedAt
    };
  }
}

function assertLocalObjectPolicy(policy, action, parameters) {
  const request = String(parameters.transportRequest || parameters.request || "").trim();
  const changeRequest = String(parameters.changeRequest || parameters.cr || "").trim();
  if (policy.requestOrCrCreationAllowed === false && (request || changeRequest)) {
    throw denied("REQUEST_OR_CR_PROHIBITED");
  }

  if (["edit_abap_source", "check_abap_program", "activate_abap_program"].includes(action)) {
    const packageName = normalize(parameters.package || parameters.devclass);
    if (policy.localObjectOnly === true && packageName !== normalize(policy.requiredLocalPackage || "$TMP")) {
      throw denied("LOCAL_OBJECT_PACKAGE_REQUIRED");
    }
  }

  if (action === "execute_transaction") {
    const transaction = normalize(parameters.transaction || parameters.tcode || parameters.transactionCode);
    if (/^(SE0[19]|SE10|STMS|SCC1|SCC4)$/.test(transaction)) {
      throw denied("TRANSPORT_TRANSACTION_PROHIBITED");
    }
  }
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function denied(code) {
  const error = new Error(`ABAP change denied: ${code}`);
  error.code = code;
  return error;
}
