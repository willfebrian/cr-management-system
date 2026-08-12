import { AuditLogger } from "./audit-logger.mjs";
import { buildSapConnectionFromEnv, createSapClientForServer, SapRfcClient, SAP_GATEWAY_CALL_CONTEXT } from "./sap-client-factory.mjs";
import { getTransportRequestTarget } from "./transport-request-targets.mjs";

/**
 * Service for releasing SAP transport requests via ZRFC_TRANSPORT_REQUEST_RELEASE.
 * Supports TEST_RUN (check readiness) and RELEASE (execute release) modes.
 */
export class TransportReleaseService {
  constructor({
    targetSystem = "DEV_AIX",
    client,
    auditLogger = new AuditLogger(),
    env = process.env
  } = {}) {
    this.target = getTransportRequestTarget(targetSystem, env);
    this.client = client || (this.target.connectionPrefix
      ? new SapRfcClient({ serverName: this.target.server, connection: buildSapConnectionFromEnv(this.target.connectionPrefix, env), envPrefix: this.target.connectionPrefix })
      : createSapClientForServer(this.target.server, env));
    this.auditLogger = auditLogger;
  }

  /**
   * Run a test-run check on a transport request without releasing.
   * Returns readiness status for each child task and the parent.
   */
  async testRun(trkorr) {
    const normalized = normalize(trkorr);
    if (!normalized) throw denied("TRKORR_REQUIRED");
    return this.execute(normalized, "TEST_RUN");
  }

  /**
   * Release a transport request (children first, then parent).
   * Requires testRun to pass first (no errors).
   */
  async release(trkorr) {
    const normalized = normalize(trkorr);
    if (!normalized) throw denied("TRKORR_REQUIRED");
    return this.execute(normalized, "RELEASE");
  }

  async execute(trkorr, mode) {
    const started = Date.now();
    try {
      const result = await this.call("ZRFC_TRANSPORT_REQUEST_RELEASE", {
        IV_TRKORR: trkorr,
        IV_MODE: mode,
        ET_RESULTS: []
      });
      const rows = (result.ET_RESULTS || []).map((row) => parseResultRow(row.LINE || row));
      const response = {
        ok: result.EV_SUCCESS === "X",
        message: result.EV_MESSAGE || "",
        mode,
        trkorr,
        targetSystem: this.target.code,
        targetServer: this.target.server,
        hasErrors: rows.some((r) => r.status === "ERROR"),
        hasWarnings: rows.some((r) => r.status === "WARNING"),
        tasks: rows
      };
      this.audit("success", mode, trkorr, started, response);
      return response;
    } catch (error) {
      this.audit("failed", mode, trkorr, started, undefined, error);
      throw error;
    }
  }

  call(rfcName, params) {
    return this.client.call(rfcName, params, SAP_GATEWAY_CALL_CONTEXT);
  }

  audit(status, mode, trkorr, started, result, error) {
    this.auditLogger?.write?.({
      status,
      agent_name: "sap_abap_technical_agent",
      server: this.target.server,
      tool_name: "transport_release_service",
      action: mode === "RELEASE" ? "release_transport_request" : "testrun_transport_request",
      object_name: trkorr,
      duration_ms: Date.now() - started,
      request: trkorr,
      error_code: error?.code,
      error_message: error?.message
    });
  }
}

function parseResultRow(line) {
  const [trkorr, trfunction, description, status, message, seq] =
    String(line || "").split("|");
  return {
    trkorr: (trkorr || "").trim(),
    trfunction: (trfunction || "").trim(),
    description: (description || "").trim(),
    status: (status || "").trim(),
    message: (message || "").trim(),
    sequence: parseInt(seq, 10) || 0
  };
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function denied(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
