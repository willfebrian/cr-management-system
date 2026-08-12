export type TransportTargetSystem = string;

export const TRANSPORT_TARGETS: ReadonlyArray<{ code: TransportTargetSystem; label: string }> = [
  { code: "DEV_NC", label: "DEV NC" },
  { code: "DEV_AIX", label: "DEV AIX" }
];

export function normalizeTransportTarget(value: unknown): TransportTargetSystem {
  const str = String(value || "").trim().toUpperCase();
  return str || "DEV_NC";
}

export function transportTargetLabel(value?: TransportTargetSystem) {
  if (!value) return "DEV NC";
  const str = String(value).trim();
  if (str === "DEV_AIX") return "DEV AIX";
  if (str === "DEV_NC") return "DEV NC";
  return str;
}

export function transportSystemOptionLabel(code: string, description?: string | null) {
  const normalizedCode = String(code || "").trim();
  const normalizedDescription = String(description || "").trim();
  if (!normalizedDescription || normalizedDescription.toUpperCase() === normalizedCode.toUpperCase()) {
    return normalizedCode;
  }
  return `${normalizedDescription} \u00b7 ${normalizedCode}`;
}
