import { assertSapServerEnabled, hasSapCapability, resolveSapServerName } from "./sap-landscape.mjs";

const DEFAULT_POLICY = {
  enabled: true,
  requireExplicitUserConfirmation: true,
  confirmationScope: "one_time_exact_action",
  forbiddenActions: [
    "create_transport_request",
    "release_transport_request",
    "assign_transport_request",
    "generic_mutating_rfc",
    "mutating_bapi"
  ],
  transportTcodes: ["SE01", "SE09", "SE10", "STMS", "SCC1", "SCC4"]
};

const MUTATING_ACTION_PATTERN = /\b(save|post|create|change|delete|release|execute_update|update|commit|park|reverse|cancel)\b/i;

export class SapActionConfirmationGuard {
  constructor(policy = DEFAULT_POLICY, confirmationService) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.confirmationService = confirmationService;
  }

  assertCanPerform({
    agentName,
    server,
    client,
    tcode,
    program,
    action,
    objectName,
    parameters = {},
    confirmation
  }) {
    if (!this.policy.enabled) throw denied("SAP_ACTION_POLICY_DISABLED");

    const normalizedAction = normalizeAction(action);
    const normalizedTcode = normalize(tcode);
    const normalizedProgram = normalize(program);
    const requestedServer = normalize(server);
    const normalizedServer = resolveSapServerName(requestedServer);
    const target = normalize(objectName || normalizedTcode || normalizedProgram);

    if (!normalizedServer) throw denied("SERVER_REQUIRED");
    assertSapServerEnabled(normalizedServer);
    if (normalizedServer === "SAP_PRD") throw denied("SAP_PRD_CONFIRMED_ACTION_PROHIBITED");
    if (!hasSapCapability(normalizedServer, "confirmed_sap_action")) throw denied("SAP_ACTION_SERVER_NOT_ALLOWED");
    if (!target) throw denied("TARGET_OBJECT_REQUIRED");
    if (!normalizedAction) throw denied("ACTION_REQUIRED");
    if (this.isTransportAction({ action: normalizedAction, tcode: normalizedTcode })) {
      throw denied("TRANSPORT_OR_CR_ACTION_PROHIBITED");
    }

    if (!this.confirmationService) throw denied("TRUSTED_CONFIRMATION_SERVICE_REQUIRED");
    const verified = this.confirmationService.verifyAndConsume(confirmation, {
      agentName,
      server: normalizedServer,
      action: normalizedAction,
      objectName: target,
      parameters: {
        client: normalize(client),
        tcode: normalizedTcode,
        program: normalizedProgram,
        ...parameters
      }
    });

    return {
      agentName: normalize(agentName),
      server: normalizedServer,
      requestedServer,
      client: normalize(client),
      tcode: normalizedTcode,
      program: normalizedProgram,
      action: normalizedAction,
      objectName: target,
      parameters,
      mutatingAction: MUTATING_ACTION_PATTERN.test(normalizedAction),
      confirmationId: verified.id,
      confirmedAt: verified.confirmedAt,
      parameterHash: verified.parameterHash
    };
  }

  isTransportAction({ action, tcode }) {
    if (this.policy.transportTcodes.includes(normalize(tcode))) return true;
    return this.policy.forbiddenActions.includes(action);
  }
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeAction(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function denied(code) {
  const error = new Error(`SAP action denied: ${code}`);
  error.code = code;
  return error;
}

