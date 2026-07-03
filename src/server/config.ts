import "dotenv/config";

export type SapCrSystemConfig = {
  code: string;
  server: string;
  owner: string;
  days: number;
  enabled: boolean;
};

export type SapConnectorMode = "internal" | "external" | "disabled";

const systemCodes = (process.env.SAP_CR_SYSTEMS || "DEV")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

const systems = Object.fromEntries(systemCodes.map((code) => [
  code,
  {
    code,
    server: process.env[`SAP_CR_${code}_SERVER`] || "",
    owner: process.env[`SAP_CR_${code}_OWNER`] || "",
    days: Number(process.env[`SAP_CR_${code}_DAYS`] || 30),
    enabled: process.env[`SAP_CR_${code}_ENABLED`] !== "false"
  }
]));

if (systems.DEV && !systems.DEV.server) systems.DEV.server = "SAP_DEV_AIX";
if (systems.DEV && !systems.DEV.owner) systems.DEV.owner = "TRSTDEV";

function boolEnv(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function listEnv(value: string | undefined, fallback: string[]) {
  const rows = String(value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return rows.length ? rows : fallback;
}

function sapConnectorMode(value: string | undefined): SapConnectorMode {
  const normalized = String(value || "internal").trim().toLowerCase();
  if (normalized === "external" || normalized === "disabled") return normalized;
  return "internal";
}

export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "0.0.0.0",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://127.0.0.1:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  pg: {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "sap_cr_management",
    user: process.env.PGUSER || "",
    password: process.env.PGPASSWORD || "",
    schema: process.env.PGSCHEMA || "cr_management"
  },
  sap: {
    connectorMode: sapConnectorMode(process.env.SAP_CONNECTOR_MODE),
    discoveryScript: process.env.SAP_DISCOVERY_SCRIPT || "scripts/sap-discovery.mjs",
    externalPlatformDir: process.env.SAP_AGENT_PLATFORM_DIR || "",
    systems,
    defaultSystem: (process.env.SAP_CR_DEFAULT_SYSTEM || "DEV").toUpperCase()
  },
  autoSync: {
    enabled: boolEnv(process.env.SAP_CR_AUTO_SYNC_ENABLED, false),
    intervalMinutes: Math.max(Number(process.env.SAP_CR_AUTO_SYNC_INTERVAL_MINUTES || 60), 5),
    systemCodes: listEnv(process.env.SAP_CR_AUTO_SYNC_SYSTEMS, systemCodes),
    lookbackDays: Math.min(Math.max(Number(process.env.SAP_CR_AUTO_SYNC_LOOKBACK_DAYS || 3), 0), 30),
    rowCount: Number(process.env.SAP_CR_AUTO_SYNC_ROW_COUNT || 5000),
    staleHours: Math.max(Number(process.env.SAP_CR_AUTO_SYNC_STALE_HOURS || 24), 1)
  },
  orphanRecovery: {
    enabled: boolEnv(process.env.SAP_CR_ORPHAN_RECOVERY_ENABLED, true),
    maxPerSync: Math.max(Number(process.env.SAP_CR_ORPHAN_RECOVERY_MAX_PER_SYNC || 200), 0)
  }
};

export function getSapCrSystem(code = config.sap.defaultSystem): SapCrSystemConfig {
  const normalized = String(code || "").trim().toUpperCase();
  const system = config.sap.systems[normalized];
  if (!system) throw new Error(`Unknown SAP CR system "${normalized}". Check SAP_CR_SYSTEMS in .env.`);
  if (!system.enabled) throw new Error(`SAP CR system "${normalized}" is disabled. Set SAP_CR_${normalized}_ENABLED=true in .env to use it.`);
  if (!system.server) throw new Error(`SAP CR system "${normalized}" has no server mapping. Fill SAP_CR_${normalized}_SERVER in .env.`);
  if (!system.owner) throw new Error(`SAP CR system "${normalized}" has no owner. Fill SAP_CR_${normalized}_OWNER in .env.`);
  return system;
}

export function listSapCrSystems() {
  return Object.values(config.sap.systems)
    .map((system) => ({
      code: system.code,
      server: system.server,
      owner: system.owner,
      days: system.days,
      enabled: system.enabled
    }));
}
