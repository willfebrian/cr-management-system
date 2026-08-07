export type TransportTargetSystem = "DEV_NC" | "DEV_AIX";

export const TRANSPORT_TARGETS: ReadonlyArray<{ code: TransportTargetSystem; label: string }> = [
  { code: "DEV_NC", label: "DEV NC" },
  { code: "DEV_AIX", label: "DEV AIX" }
];

export function normalizeTransportTarget(value: unknown): TransportTargetSystem {
  return String(value || "").trim().toUpperCase() === "DEV_AIX" ? "DEV_AIX" : "DEV_NC";
}

export function transportTargetLabel(value: TransportTargetSystem) {
  return value === "DEV_AIX" ? "DEV AIX" : "DEV NC";
}
