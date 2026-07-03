import "dotenv/config";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const args = parseArgs(process.argv.slice(2));
const schema = process.env.PGSCHEMA || "cr_management";
const systems = String(args.systems || "QA,PRD").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
const fromDate = args.fromDate || `${new Date().getFullYear()}-01-01`;
const toDate = args.toDate || ymd(new Date());
const rowCount = Number(args.rowCount || 5000);
const serverBySystem = {
  QA: process.env.SAP_CR_QA_SERVER || "SAP_QA",
  PRD: process.env.SAP_CR_PRD_SERVER || "SAP_PRD"
};

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        options: `-c search_path=${schema},public`
      }
);

try {
  const results = [];
  for (const system of systems) {
    const server = serverBySystem[system];
    if (!server) {
      results.push({ system, ok: false, message: "No SAP server configured." });
      continue;
    }
    const logs = await readTpalog(server, fromDate, toDate, rowCount);
    const latestLogs = latestByTrkorr(logs);
    let confirmed = 0;
    for (const log of latestLogs) {
      const parsed = parseSapTimestamp(log.TRTIME);
      const result = await pool.query(`
        INSERT INTO cr_transport_lifecycle (
          source_system_code, trkorr, target_system_code, transport_status, evidence_source,
          imported_at, import_date, import_time, return_code, message, last_checked_at, updated_at
        )
        SELECT
          'DEV',
          dev.trkorr,
          $2,
          $3,
          'confirmed',
          $4::timestamptz,
          $5::date,
          $6::time,
          $7,
          $8,
          now(),
          now()
        FROM cr_requests dev
        WHERE dev.sap_system_code = 'DEV'
          AND dev.parent_request IS NULL
          AND dev.trkorr = $1
        ON CONFLICT (source_system_code, trkorr, target_system_code) DO UPDATE SET
          transport_status = EXCLUDED.transport_status,
          evidence_source = EXCLUDED.evidence_source,
          imported_at = EXCLUDED.imported_at,
          import_date = EXCLUDED.import_date,
          import_time = EXCLUDED.import_time,
          return_code = EXCLUDED.return_code,
          message = EXCLUDED.message,
          last_checked_at = now(),
          updated_at = now()
      `, [
        log.TRKORR,
        system,
        transportStatusFromReturnCode(log.RETCODE),
        parsed.iso,
        parsed.date,
        parsed.time,
        log.RETCODE || null,
        `Confirmed from TPALOG${log.TRSTEP ? ` step ${log.TRSTEP}` : ""}${log.HOST ? ` on ${log.HOST}` : ""}.`
      ]);
      confirmed += result.rowCount || 0;
    }
    results.push({ system, ok: true, read: logs.length, latest: latestLogs.length, confirmed });
  }
  console.log(JSON.stringify({ ok: true, fromDate, toDate, rowCount, results }, null, 2));
} finally {
  await pool.end();
}

async function readTpalog(server, start, end, limit) {
  const runtime = resolveSapDiscoveryRuntime();
  const fromStamp = `${start.replaceAll("-", "")}000000`;
  const toStamp = `${end.replaceAll("-", "")}235959`;
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    runtime.script,
    "table",
    "TPALOG",
    "--server",
    server,
    "--fields",
    "TRTIME,TRKORR,TARSYSTEM,TRSTEP,TRUSER,RETCODE,HOST",
    "--where",
    `TRTIME >= '${fromStamp}' AND TRTIME <= '${toStamp}'`,
    "--row-count",
    String(limit),
    "--compact"
  ], { cwd: runtime.cwd, maxBuffer: 20 * 1024 * 1024 });
  if (stderr.trim()) throw new Error(stderr.trim());
  const parsed = JSON.parse(stdout);
  return parsed.result?.rows || [];
}

function resolveSapDiscoveryRuntime() {
  const mode = String(process.env.SAP_CONNECTOR_MODE || "internal").trim().toLowerCase();
  if (mode === "disabled") {
    throw new Error("SAP connector is disabled. Set SAP_CONNECTOR_MODE=internal to refresh transport logs.");
  }
  if (mode === "external") {
    const cwd = process.env.SAP_AGENT_PLATFORM_DIR;
    if (!cwd) throw new Error("SAP_AGENT_PLATFORM_DIR is required when SAP_CONNECTOR_MODE=external.");
    return { cwd, script: path.join(cwd, "scripts", "sap-discovery.mjs") };
  }
  const configuredScript = process.env.SAP_DISCOVERY_SCRIPT || "scripts/sap-discovery.mjs";
  return {
    cwd: process.cwd(),
    script: path.isAbsolute(configuredScript) ? configuredScript : path.resolve(process.cwd(), configuredScript)
  };
}

function latestByTrkorr(logs) {
  const byRequest = new Map();
  for (const log of logs.filter((item) => item.TRKORR)) {
    const current = byRequest.get(log.TRKORR);
    if (!current || String(log.TRTIME || "") >= String(current.TRTIME || "")) byRequest.set(log.TRKORR, log);
  }
  return [...byRequest.values()];
}

function parseSapTimestamp(value) {
  const timestamp = String(value || "").padEnd(14, "0");
  if (!/^\d{14}$/.test(timestamp)) return { iso: null, date: null, time: null };
  const date = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
  const time = `${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}`;
  return { iso: `${date}T${time}+07:00`, date, time };
}

function transportStatusFromReturnCode(returnCode) {
  const parsed = Number(returnCode);
  if (!Number.isFinite(parsed)) return "imported";
  return parsed <= 4 ? "imported" : "failed";
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    options[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return options;
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
