export const TRANSPORT_REQUEST_TARGETS = Object.freeze({
  DEV_NC: Object.freeze({ code: "DEV_NC", server: "SAP_DEV_NC", client: "130", sapUser: "TRSTDEV", package: "ZTRD" }),
  DEV_AIX: Object.freeze({ code: "DEV_AIX", server: "SAP_DEV_AIX", client: "130", sapUser: "TRSTDEV", package: "ZTRD" })
});

export function normalizeTransportTarget(value) {
  return String(value || "DEV_NC").trim().toUpperCase() || "DEV_NC";
}

export function getTransportRequestTarget(value, env = process.env) {
  const code = normalizeTransportTarget(value);
  if (env.SAP_CR_TARGET_CODE === code) return Object.freeze({
    code,
    server: String(env.SAP_CR_TARGET_SERVER || code).trim().toUpperCase(),
    client: String(env.SAP_CR_TARGET_CLIENT || "").trim(),
    sapUser: String(env.SAP_CR_TARGET_USER || "").trim().toUpperCase(),
    package: String(env.SAP_CR_TARGET_PACKAGE || "ZTRD").trim().toUpperCase(),
    connectionPrefix: "SAP_CR_TARGET"
  });
  const target = TRANSPORT_REQUEST_TARGETS[code];
  if (!target) throw new Error("SAP_CR_CREATE_TARGET_NOT_CONFIGURED");
  return target;
}
