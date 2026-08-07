export const TRANSPORT_REQUEST_TARGETS = Object.freeze({
  DEV_NC: Object.freeze({ code: "DEV_NC", server: "SAP_DEV_NC", client: "130", sapUser: "TRSTDEV", package: "ZTRD" }),
  DEV_AIX: Object.freeze({ code: "DEV_AIX", server: "SAP_DEV_AIX", client: "130", sapUser: "TRSTDEV", package: "ZTRD" })
});

export function normalizeTransportTarget(value) {
  return String(value || "").trim().toUpperCase() === "DEV_AIX" ? "DEV_AIX" : "DEV_NC";
}

export function getTransportRequestTarget(value) {
  return TRANSPORT_REQUEST_TARGETS[normalizeTransportTarget(value)];
}
