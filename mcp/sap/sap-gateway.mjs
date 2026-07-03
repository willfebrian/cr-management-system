import { AuditLogger } from "./audit-logger.mjs";
import { ReadOnlyGuard } from "./read-only-guard.mjs";
import { MemoryTtlCache } from "./memory-ttl-cache.mjs";
import { SAP_GATEWAY_CALL_CONTEXT } from "./sap-client-factory.mjs";

export class SapGateway {
  constructor({
    clients,
    guard = new ReadOnlyGuard(),
    auditLogger = new AuditLogger(),
    cache = new MemoryTtlCache(),
    timeoutMs = Number(process.env.SAP_RFC_TIMEOUT_MS || 30000)
  }) {
    this.clients = clients;
    this.guard = guard;
    this.auditLogger = auditLogger;
    this.cache = cache;
    this.timeoutMs = timeoutMs;
  }

  async call({ agentName, server, rfcName, params = {}, userQuestion }) {
    const started = Date.now();
    let guardedCall;

    try {
      guardedCall = this.guard.assertCanCall({ server, rfcName, params, agentName });
      const client = this.clients[guardedCall.server] || this.clients[server];

      if (!client) {
        throw new Error(`No SAP client configured for ${guardedCall.server}`);
      }

      const cacheKey = this.cacheKey(guardedCall);
      const cached = cacheKey ? this.cache.get(cacheKey) : undefined;
      if (cached !== undefined) {
        this.auditLogger.write(this.auditEvent({
          status: "cache_hit",
          agentName,
          server: guardedCall.server,
          rfcName: guardedCall.rfcName,
          params: guardedCall.params,
          userQuestion,
          durationMs: Date.now() - started
        }));
        return cached;
      }

      const result = await withTimeout(
        client.call(guardedCall.rfcName, guardedCall.params, SAP_GATEWAY_CALL_CONTEXT),
        this.timeoutMs,
        guardedCall
      );
      if (cacheKey) this.cache.set(cacheKey, result);
      this.auditLogger.write(this.auditEvent({
        status: "success",
        agentName,
        server: guardedCall.server,
        rfcName: guardedCall.rfcName,
        params: guardedCall.params,
        userQuestion,
        durationMs: Date.now() - started
      }));
      return result;
    } catch (error) {
      this.auditLogger.write(this.auditEvent({
        status: "denied_or_failed",
        agentName,
        server: guardedCall?.server || server,
        rfcName: guardedCall?.rfcName || rfcName,
        params,
        userQuestion,
        durationMs: Date.now() - started,
        errorCode: error.code,
        errorMessage: error.message
      }));
      throw error;
    }
  }

  cacheKey({ server, rfcName, params }) {
    if (!isCacheableMetadataCall(rfcName, params)) return null;
    return JSON.stringify({ server, rfcName, params });
  }

  auditEvent({ status, agentName, server, rfcName, params, userQuestion, durationMs, errorCode, errorMessage }) {
    return {
      status,
      agent_name: agentName,
      server,
      tool_name: "sap_rfc_gateway",
      rfc_name: rfcName,
      object_name: params?.QUERY_TABLE || params?.PROGRAM || params?.FUNCNAME,
      row_limit: params?.ROWCOUNT,
      where_clause: Array.isArray(params?.OPTIONS)
        ? params.OPTIONS.map((option) => option.TEXT).filter(Boolean).join(" ")
        : undefined,
      user_question: userQuestion,
      duration_ms: durationMs,
      error_code: errorCode,
      error_message: errorMessage
    };
  }
}

function isCacheableMetadataCall(rfcName, params) {
  if (["DDIF_FIELDINFO_GET", "DDIF_TABL_GET", "DD_DOMVALUES_GET", "RFC_GET_FUNCTION_INTERFACE"].includes(rfcName)) {
    return true;
  }
  if (rfcName !== "RFC_READ_TABLE") return false;
  return new Set(["DD02L", "DD03L", "DD07L", "DD07T", "DD08L", "TADIR", "TSTC", "TRDIR"])
    .has(String(params?.QUERY_TABLE || "").toUpperCase());
}

function withTimeout(promise, timeoutMs, call) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`SAP RFC timed out after ${timeoutMs} ms`);
        error.code = "SAP_RFC_TIMEOUT";
        error.server = call.server;
        error.rfcName = call.rfcName;
        reject(error);
      }, timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

