import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { getSapCrSystem } from "../config.js";

const execFileAsync = promisify(execFile);

export type CrListResult = {
  ok: boolean;
  query: {
    server: string;
    owner?: string;
    fromDate?: string;
    rowCount: number;
  };
  count: number;
  summary: Record<string, number>;
  requests: CrHeader[];
};

export type CrDetailResult = {
  ok: boolean;
  server: string;
  trkorr: string;
  header: CrHeader | null;
  tasks: CrHeader[];
  counts: {
    taskCount: number;
    objectCount: number;
    keyCount: number;
  };
  objectGroups: Array<{
    trkorr: string;
    objectCount: number;
    keyCount: number;
    objects: CrObject[];
    keys: CrObjectKey[];
  }>;
};

export type CrHeader = {
  trkorr: string;
  parentRequest?: string;
  description?: string;
  function?: string;
  status?: string;
  statusGroup: string;
  targetSystem?: string;
  category?: string;
  owner?: string;
  changedDate?: string;
  changedTime?: string;
};

export type CrObject = {
  trkorr: string;
  position: string;
  pgmid?: string;
  objectType?: string;
  objectName?: string;
  diffReadiness?: string;
};

export type CrObjectKey = {
  trkorr: string;
  position: string;
  pgmid?: string;
  objectType?: string;
  objectName?: string;
  tableKey?: string;
};

export type TransportImportLog = {
  trkorr: string;
  targetSystem?: string;
  timestamp?: string;
  returnCode?: string;
  step?: string;
  user?: string;
  host?: string;
};

export type CrCreationLog = {
  trkorr: string;
  createdDate?: string;
  createdTime?: string;
  createdBy?: string;
  creationFlag?: string;
};

export async function readCrList(options: { systemCode?: string; fromDate: string; toDate: string; owner?: string; rowCount?: number }) {
  const system = getSapCrSystem(options.systemCode);
  return runSapDiscovery<CrListResult>([
    "cr-list",
    "--server",
    system.server,
    "--from-date",
    options.fromDate,
    "--to-date",
    options.toDate,
    "--owner",
    options.owner || system.owner,
    "--row-count",
    String(options.rowCount || 500),
    "--compact"
  ]);
}

export async function readCrDetail(trkorr: string, systemCode?: string) {
  const system = getSapCrSystem(systemCode);
  return runSapDiscovery<CrDetailResult>([
    "cr-detail",
    trkorr,
    "--server",
    system.server,
    "--include-keys",
    "--row-count",
    "1000",
    "--compact"
  ]);
}

export async function readTransportImportLogs(options: {
  targetSystemCode: string;
  fromDate: string;
  toDate: string;
  rowCount?: number;
}) {
  const system = getSapCrSystem(options.targetSystemCode);
  const fromStamp = `${options.fromDate.replaceAll("-", "")}000000`;
  const toStamp = `${options.toDate.replaceAll("-", "")}235959`;
  const result = await runSapDiscovery<{
    ok: boolean;
    result: {
      rows: Array<Record<string, string>>;
    };
  }>([
    "table",
    "TPALOG",
    "--server",
    system.server,
    "--fields",
    "TRTIME,TRKORR,TARSYSTEM,TRSTEP,TRUSER,RETCODE,HOST",
    "--where",
    `TRTIME >= '${fromStamp}' AND TRTIME <= '${toStamp}'`,
    "--row-count",
    String(options.rowCount || 5000),
    "--compact"
  ]);

  return (result.result?.rows || []).map((row) => ({
    trkorr: row.TRKORR,
    targetSystem: row.TARSYSTEM,
    timestamp: row.TRTIME,
    returnCode: row.RETCODE,
    step: row.TRSTEP,
    user: row.TRUSER,
    host: row.HOST
  })) satisfies TransportImportLog[];
}

export async function readCrCreationLogs(options: {
  systemCode?: string;
  fromDate: string;
  toDate: string;
  owner?: string;
  rowCount?: number;
}) {
  const system = getSapCrSystem(options.systemCode);
  const fromDate = options.fromDate.replaceAll("-", "");
  const toDate = options.toDate.replaceAll("-", "");
  const where = [
    `CRE_DATE >= '${fromDate}'`,
    `AND CRE_DATE <= '${toDate}'`
  ];
  const owner = String(options.owner || system.owner || "").trim().toUpperCase();
  if (owner) where.push(`AND CRE_USER = '${owner}'`);
  const whereArgs = where.flatMap((condition) => ["--where", condition]);
  const result = await runSapDiscovery<{
    ok: boolean;
    result: {
      rows: Array<Record<string, string>>;
    };
  }>([
    "table",
    "E070CREATE",
    "--server",
    system.server,
    "--fields",
    "TRKORR,CRE_DATE,CRE_TIME,CRE_USER,CRE_FLAG",
    ...whereArgs,
    "--row-count",
    String(options.rowCount || 5000),
    "--compact"
  ]);

  return (result.result?.rows || []).map((row) => ({
    trkorr: row.TRKORR,
    createdDate: row.CRE_DATE,
    createdTime: row.CRE_TIME,
    createdBy: row.CRE_USER,
    creationFlag: row.CRE_FLAG
  })) satisfies CrCreationLog[];
}

async function runSapDiscovery<T>(args: string[]) {
  const runtime = resolveSapDiscoveryRuntime();
  const script = runtime.script;
  if (!fs.existsSync(script)) {
    throw new Error(`SAP connector script was not found at ${script}. Check SAP_CONNECTOR_MODE and SAP_DISCOVERY_SCRIPT in .env.`);
  }
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], {
    cwd: runtime.cwd,
    maxBuffer: 10 * 1024 * 1024
  });
  if (stderr.trim()) {
    throw new Error(stderr.trim());
  }
  return JSON.parse(stdout) as T;
}

function resolveSapDiscoveryRuntime() {
  if (config.sap.connectorMode === "disabled") {
    throw new Error("SAP connector is disabled. Set SAP_CONNECTOR_MODE=internal to use the bundled web connector, or external to use SAP_AGENT_PLATFORM_DIR.");
  }

  if (config.sap.connectorMode === "external") {
    const cwd = config.sap.externalPlatformDir;
    if (!cwd) throw new Error("SAP_AGENT_PLATFORM_DIR is required when SAP_CONNECTOR_MODE=external.");
    return {
      cwd,
      script: path.join(cwd, "scripts", "sap-discovery.mjs")
    };
  }

  const configuredScript = config.sap.discoveryScript;
  const script = path.isAbsolute(configuredScript)
    ? configuredScript
    : path.resolve(process.cwd(), configuredScript);
  return {
    cwd: process.cwd(),
    script
  };
}
