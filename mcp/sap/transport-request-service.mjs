import { AuditLogger } from "./audit-logger.mjs";
import { AbapConfirmationService } from "./abap-confirmation-service.mjs";
import { createSapClientForServer, SAP_GATEWAY_CALL_CONTEXT } from "./sap-client-factory.mjs";
import { objectScope, TransportRequestGuard } from "./transport-request-guard.mjs";
import { getTransportRequestTarget } from "./transport-request-targets.mjs";

export class TransportRequestService {
  constructor({
    targetSystem = "DEV_NC",
    client,
    confirmationService,
    auditLogger = new AuditLogger(),
    guard
  } = {}) {
    this.target = getTransportRequestTarget(targetSystem);
    this.client = client || createSapClientForServer(this.target.server);
    this.confirmationService = confirmationService;
    this.guard = guard || new TransportRequestGuard({ confirmationService });
    this.auditLogger = auditLogger;
  }

  async resolve(query) {
    const value = normalize(query);
    if (!value) return { ok: true, rows: [] };
    if (!/^(Z|Y|\/)/.test(value)) throw denied("CUSTOM_NAMESPACE_REQUIRED");
    const result = await this.call("ZRFC_TRANSPORT_OBJECT_RESOLVE", { IV_QUERY: value });
    return {
      ok: result.EV_SUCCESS === "X",
      message: result.EV_MESSAGE,
      rows: (result.ET_RESULTS || []).map((row) => parseResolved(row.LINE || row))
    };
  }

  async preflight({ description, objects }) {
    const authorized = this.guard.authorize({
      server: this.target.server, client: this.target.client, sapUser: this.target.sapUser,
      mode: "PREFLIGHT", description, objects
    });
    return this.execute(authorized);
  }

  async create({ description, objects, confirmed }) {
    if (confirmed !== true) throw denied("EXPLICIT_CONFIRMATION_REQUIRED");
    const normalizedObjects = normalizeObjects(objects);
    const preflightAuthorized = this.guard.authorize({
      server: this.target.server, client: this.target.client, sapUser: this.target.sapUser,
      mode: "PREFLIGHT", description, objects: normalizedObjects
    });
    const preflight = await this.execute(preflightAuthorized);
    if (!preflight.ok) throw denied(preflight.message || "PREFLIGHT_FAILED");
    const parameters = {
      client: this.target.client,
      sapUser: this.target.sapUser,
      mode: "CREATE",
      description: String(description || "").trim(),
      package: this.target.package,
      objects: normalizedObjects
    };
    const confirmationService = this.confirmationService || new AbapConfirmationService();
    const createGuard = this.confirmationService
      ? this.guard
      : new TransportRequestGuard({ confirmationService });
    const confirmation = confirmationService.issue({
      agentName: "sap_abap_technical_agent",
      server: this.target.server,
      action: "create_transport_request",
      objectName: objectScope(normalizedObjects),
      parameters
    });
    const authorized = createGuard.authorize({
      server: this.target.server, client: this.target.client, sapUser: this.target.sapUser,
      mode: "CREATE", description, objects: normalizedObjects, confirmation
    });
    return this.execute(authorized);
  }

  async execute(authorized) {
    const started = Date.now();
    try {
      const result = await this.call("ZRFC_TRANSPORT_REQUEST_CREATE", {
        IV_MODE: authorized.mode,
        IV_TEXT: authorized.description,
        IV_PACKAGE: authorized.package,
        IT_OBJECTS: authorized.objects.map((item) => ({
          LINE: [item.pgmid, item.objectType, item.objectName, item.sourcePackage].join("|")
        }))
      });
      const response = {
        ok: result.EV_SUCCESS === "X",
        phase: result.EV_PHASE,
        message: result.EV_MESSAGE,
        request: String(result.EV_REQUEST || "").trim(),
        task: String(result.EV_TASK || "").trim(),
        targetSystem: this.target.code,
        targetServer: this.target.server,
        rows: (result.ET_RESULTS || []).map((row) => String(row.LINE || row))
      };
      this.audit("success", authorized, started, response);
      return response;
    } catch (error) {
      this.audit("failed", authorized, started, undefined, error);
      throw error;
    }
  }

  call(rfcName, params) {
    return this.client.call(rfcName, params, SAP_GATEWAY_CALL_CONTEXT);
  }

  audit(status, authorized, started, result, error) {
    this.auditLogger?.write?.({
      status,
      agent_name: "sap_abap_technical_agent",
      server: this.target.server,
      tool_name: "transport_request_service",
      action: authorized.mode === "CREATE" ? "create_transport_request" : "preflight_transport_request",
      object_name: objectScope(authorized.objects),
      duration_ms: Date.now() - started,
      request: result?.request,
      task: result?.task,
      error_code: error?.code,
      error_message: error?.message
    });
  }
}

function parseResolved(line) {
  const [pgmid, objectType, objectName, sourcePackage, locked, lockOrder, lockUser] = String(line || "").split("|");
  return {
    pgmid, objectType, objectName, sourcePackage,
    targetPackage: "ZTRD",
    locked: locked === "X",
    lockOrder: lockOrder || "",
    lockUser: lockUser || ""
  };
}

function normalizeObjects(objects) {
  return (Array.isArray(objects) ? objects : []).map((item) => ({
    pgmid: normalize(item?.pgmid),
    objectType: normalize(item?.objectType || item?.object),
    objectName: normalize(item?.objectName),
    sourcePackage: normalize(item?.sourcePackage || item?.package),
    targetPackage: "ZTRD"
  }));
}

function normalize(value) { return String(value || "").trim().toUpperCase(); }
function denied(code) { const error = new Error(code); error.code = code; return error; }
