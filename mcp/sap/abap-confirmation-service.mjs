import crypto from "node:crypto";

export class AbapConfirmationService {
  constructor({
    secret = process.env.SAP_ABAP_ACTION_APPROVAL_SECRET,
    maxAgeMinutes = 30,
    now = () => Date.now()
  } = {}) {
    if (!secret) throw new Error("SAP_ABAP_ACTION_APPROVAL_SECRET is required");
    this.secret = secret;
    this.maxAgeMs = Number(maxAgeMinutes) * 60_000;
    this.now = now;
    this.consumedIds = new Set();
  }

  issue({ agentName, server, action, objectName, parameters = {}, confirmationId }) {
    const payload = {
      id: String(confirmationId || crypto.randomUUID()),
      agentName: normalize(agentName),
      server: normalize(server),
      action: normalizeAction(action),
      objectName: normalize(objectName),
      parameterHash: hashParameters(parameters),
      confirmedAt: new Date(this.now()).toISOString()
    };
    return {
      payload,
      signature: sign(payload, this.secret)
    };
  }

  verifyAndConsume(token, expected) {
    if (!token?.payload || !token?.signature) throw denied("SIGNED_CONFIRMATION_REQUIRED");
    if (!crypto.timingSafeEqual(
      Buffer.from(String(token.signature)),
      Buffer.from(sign(token.payload, this.secret))
    )) throw denied("INVALID_CONFIRMATION_SIGNATURE");

    const payload = token.payload;
    if (this.consumedIds.has(payload.id)) throw denied("CONFIRMATION_ALREADY_USED");
    if (normalize(payload.agentName) !== normalize(expected.agentName)) throw denied("CONFIRMATION_AGENT_MISMATCH");
    if (normalize(payload.server) !== normalize(expected.server)) throw denied("CONFIRMATION_SERVER_MISMATCH");
    if (normalizeAction(payload.action) !== normalizeAction(expected.action)) throw denied("CONFIRMATION_ACTION_MISMATCH");
    if (normalize(payload.objectName) !== normalize(expected.objectName)) throw denied("CONFIRMATION_OBJECT_MISMATCH");
    if (payload.parameterHash !== hashParameters(expected.parameters || {})) throw denied("CONFIRMATION_PARAMETER_MISMATCH");

    const confirmedAt = new Date(payload.confirmedAt).getTime();
    const now = this.now();
    if (!Number.isFinite(confirmedAt)) throw denied("CONFIRMATION_TIMESTAMP_REQUIRED");
    if (confirmedAt > now + 5_000) throw denied("CONFIRMATION_FROM_FUTURE");
    if (now - confirmedAt > this.maxAgeMs) throw denied("CONFIRMATION_EXPIRED");

    this.consumedIds.add(payload.id);
    return payload;
  }
}

export function hashParameters(parameters) {
  return crypto.createHash("sha256").update(stableStringify(parameters)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(stableStringify(payload)).digest("hex");
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeAction(value) {
  return String(value || "").trim().toLowerCase();
}

function denied(code) {
  const error = new Error(`ABAP confirmation denied: ${code}`);
  error.code = code;
  return error;
}
