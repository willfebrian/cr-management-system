export class AbapActionGateway {
  constructor({
    guard,
    executor,
    auditLogger,
    trustedAgentName = "sap_abap_technical_agent"
  }) {
    if (!guard) throw new Error("ABAP action guard is required");
    if (typeof executor !== "function") throw new Error("ABAP action executor is required");
    this.guard = guard;
    this.executor = executor;
    this.auditLogger = auditLogger;
    this.trustedAgentName = trustedAgentName;
  }

  async perform({ server, action, objectName, parameters = {}, confirmation }) {
    let authorized;
    const started = Date.now();
    try {
      authorized = this.guard.assertCanPerform({
        agentName: this.trustedAgentName,
        server,
        action,
        objectName,
        parameters,
        confirmation
      });
      this.audit("authorized", authorized, started);
      const result = await this.executor(authorized);
      assertNoRequestOrCr(authorized, result);
      this.audit("success", authorized, started);
      return result;
    } catch (error) {
      this.audit("denied_or_failed", authorized || {
        agentName: this.trustedAgentName,
        server,
        action,
        objectName
      }, started, error);
      throw error;
    }
  }

  audit(status, action, started, error) {
    this.auditLogger?.write?.({
      status,
      agent_name: action.agentName,
      server: action.server,
      tool_name: "abap_dev_confirmed_action",
      action: action.action,
      object_name: action.objectName,
      confirmation_id: action.confirmationId,
      parameter_hash: action.parameterHash,
      duration_ms: Date.now() - started,
      error_code: error?.code,
      error_message: error?.message
    });
  }
}

function assertNoRequestOrCr(action, result = {}) {
  if (result.transportRequestCreated || result.changeRequestCreated ||
      result.requestPrompted || result.transportRequest || result.changeRequest || result.request || result.cr) {
    const error = new Error("ABAP change denied: REQUEST_OR_CR_CREATED");
    error.code = "REQUEST_OR_CR_CREATED";
    throw error;
  }
  if ((["edit_abap_source", "check_abap_program", "activate_abap_program"].includes(action.action)) &&
      String(result.package || result.devclass || "").trim().toUpperCase() !== "$TMP") {
    const error = new Error("ABAP change denied: LOCAL_OBJECT_RESULT_REQUIRED");
    error.code = "LOCAL_OBJECT_RESULT_REQUIRED";
    throw error;
  }
}

