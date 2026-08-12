import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSapNwRfcSdkOnPath } from "../mcp/sap/sap-sdk-path.mjs";
import { buildSapConnectionFromPrefixes } from "../mcp/sap/sap-client-factory.mjs";

const confirmation = "--confirm=DEV_NC_AND_DEV_AIX_ZRFC_RELEASE_OBJECT_STATUS";
if (!process.argv.includes("--apply") || !process.argv.includes(confirmation)) {
  throw new Error(`Refusing SAP mutation without --apply ${confirmation}`);
}

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = path.join(projectRoot, "sap", "abap", "zrfc_transport_request_release", "ZRFC_TRANSPORT_REQUEST_RELEASE.abap");
const backupDir = path.join(projectRoot, "sap", "abap", "zrfc_transport_request_release", "backups");
const sourceLines = fs.readFileSync(sourcePath, "utf8").replace(/\r/g, "").split("\n").filter((line, index, rows) => index < rows.length - 1 || line !== "");
if (sourceLines.some((line) => line.length > 255)) throw new Error("ABAP_SOURCE_LINE_EXCEEDS_255");

ensureSapNwRfcSdkOnPath();
const { Client } = await import("node-rfc");
const targets = [
  { prefix: "SAP_DEV_NC", label: "DEV_NC", syntaxCheck: true },
  { prefix: "SAP_DEV_AIX", label: "DEV_AIX", syntaxCheck: false }
];
const report = { sourcePath, sourceLineCount: sourceLines.length, targets: [] };

function normalizedLines(lines) {
  return lines.map((line) => String(line || "").replace(/\s+$/g, ""));
}

async function resolveFunction(client) {
  const result = await client.call("RFC_READ_TABLE", {
    QUERY_TABLE: "TFDIR",
    DELIMITER: "|",
    FIELDS: [{ FIELDNAME: "PNAME" }, { FIELDNAME: "INCLUDE" }],
    OPTIONS: [{ TEXT: "FUNCNAME = 'ZRFC_TRANSPORT_REQUEST_RELEASE'" }],
    ROWCOUNT: 1
  });
  const [program, includeNumber] = String(result.DATA?.[0]?.WA || "").split("|").map((value) => value.trim());
  if (!program?.startsWith("SAPL") || !includeNumber) throw new Error("FUNCTION_INCLUDE_NOT_FOUND");
  return { program, include: `L${program.slice(4)}U${includeNumber}` };
}

async function readSource(client, include) {
  const result = await client.call("RPY_PROGRAM_READ", {
    PROGRAM_NAME: include,
    ONLY_SOURCE: "X",
    WITH_INCLUDELIST: "",
    WITH_LOWERCASE: "X",
    SOURCE: [],
    SOURCE_EXTENDED: [],
    INCLUDE_TAB: [],
    TEXTELEMENTS: []
  });
  return result.SOURCE?.length
    ? result.SOURCE.map((row) => row.LINE)
    : (result.SOURCE_EXTENDED || []).map((row) => row.LINE);
}

async function writeSource(client, include, lines) {
  const result = await client.call("Z_RFC_PROGRAM_UPDATE", {
    IV_PROGRAM_NAME: include,
    IV_PACKAGE: "$TMP",
    IV_CORRNUMBER: "",
    IT_SOURCE: lines.map((LINE) => ({ LINE })),
    IT_TEXTPOOL: [],
    IT_TITLES: [],
    IT_STATUSES: [],
    IT_FUNCTIONS: []
  });
  if (result.EV_SUCCESS !== "X") throw new Error(result.EV_MESSAGE || "SOURCE_UPDATE_FAILED");
}

async function verifyReadBack(client, include, expected) {
  const actual = await readSource(client, include);
  if (JSON.stringify(normalizedLines(actual)) !== JSON.stringify(normalizedLines(expected))) {
    throw new Error(`SOURCE_READ_BACK_MISMATCH expected=${expected.length} actual=${actual.length}`);
  }
  return actual;
}

async function syntaxCheck(client, program, include) {
  const bodyLines = ["FUNCTION-POOL ZFRFC.", ...sourceLines];
  const result = await client.call("ZRFC_SOURCE_SYNTAX_CHECK", {
    IV_PROGRAM: include,
    IV_GLOBAL_PROGRAM: "",
    IT_SOURCE: bodyLines.map((LINE) => ({ LINE }))
  });
  if (result.EV_SUCCESS !== "X") {
    throw new Error(`SYNTAX_ERROR line=${result.EV_ERROR_LINE} message=${result.EV_ERROR_MESSAGE}`);
  }
}

async function findObjectProbe(client) {
  const table = await client.call("RFC_READ_TABLE", {
    QUERY_TABLE: "E070",
    DELIMITER: "|",
    FIELDS: [
      { FIELDNAME: "TRKORR" },
      { FIELDNAME: "TRFUNCTION" },
      { FIELDNAME: "TRSTATUS" },
      { FIELDNAME: "AS4USER" },
      { FIELDNAME: "STRKORR" }
    ],
    OPTIONS: [{ TEXT: "TRSTATUS = 'D' AND AS4USER = 'TRSTDEV'" }],
    ROWCOUNT: 5000
  });
  const candidates = (table.DATA || []).map((row) => {
    const [trkorr, trfunction, trstatus, owner, parent] = String(row.WA || "").split("|").map((value) => value.trim());
    return { trkorr, trfunction, trstatus, owner, parent };
  }).filter((row) => !row.parent && ["K", "W"].includes(row.trfunction)).sort((a, b) => b.trkorr.localeCompare(a.trkorr));

  for (const candidate of candidates.slice(0, 40)) {
    try {
      const result = await client.call("ZRFC_TRANSPORT_REQUEST_RELEASE", {
        IV_TRKORR: candidate.trkorr,
        IV_MODE: "TEST_RUN",
        ET_RESULTS: []
      });
      const lines = (result.ET_RESULTS || []).map((row) => String(row.LINE || row));
      if (lines.some((line) => line.startsWith("OBJECT|"))) {
        return { trkorr: candidate.trkorr, message: result.EV_MESSAGE, objectRows: lines.filter((line) => line.startsWith("OBJECT|")).length, sample: lines.slice(0, 5) };
      }
    } catch {
      // Try the next modifiable parent without mutating SAP.
    }
  }
  return null;
}

fs.mkdirSync(backupDir, { recursive: true });
for (const target of targets) {
  const targetReport = { target: target.label, prefix: target.prefix, status: "started" };
  report.targets.push(targetReport);
  const { connection } = buildSapConnectionFromPrefixes([target.prefix], process.env);
  if (String(connection.client) !== "130" || String(connection.user).toUpperCase() !== "TRSTDEV") {
    throw new Error(`SYSTEM_OR_USER_NOT_ALLOWED ${target.prefix}/${connection.client}/${connection.user}`);
  }
  const client = new Client(connection);
  let backup = [];
  let include = "";
  let mutated = false;
  try {
    await client.open();
    const system = (await client.call("RFC_SYSTEM_INFO", {})).RFCSI_EXPORT || {};
    targetReport.systemId = String(system.RFCSYSID || "").trim();
    targetReport.client = String(connection.client);
    targetReport.user = String(connection.user).toUpperCase();
    if (targetReport.systemId !== "TRD") throw new Error(`SYSTEM_NOT_ALLOWED ${targetReport.systemId}`);

    const resolved = await resolveFunction(client);
    include = resolved.include;
    targetReport.include = include;
    backup = await readSource(client, include);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `${stamp}-${target.label}-${include}.abap`);
    fs.writeFileSync(backupPath, backup.join("\n") + "\n", "utf8");
    targetReport.backupPath = backupPath;

    if (target.syntaxCheck) {
      await syntaxCheck(client, resolved.program, include);
      targetReport.syntaxCheck = "passed";
    }

    await writeSource(client, include, sourceLines);
    mutated = true;
    await verifyReadBack(client, include, sourceLines);
    targetReport.readBack = "exact";

    const emptyProbe = await client.call("ZRFC_TRANSPORT_REQUEST_RELEASE", {
      IV_TRKORR: "",
      IV_MODE: "TEST_RUN",
      ET_RESULTS: []
    });
    if (emptyProbe.EV_MESSAGE !== "TRKORR_REQUIRED") throw new Error(`UNEXPECTED_RUNTIME_PROBE ${emptyProbe.EV_MESSAGE}`);
    targetReport.runtimeCallable = true;

    const objectProbe = await findObjectProbe(client);
    targetReport.objectProbe = objectProbe || { status: "no_modifiable_parent_with_objects_found" };
    targetReport.status = objectProbe ? "deployed_and_object_verified" : "deployed_runtime_verified";
  } catch (error) {
    targetReport.status = "failed";
    targetReport.error = error.message;
    if (mutated && backup.length && include) {
      try {
        await writeSource(client, include, backup);
        await verifyReadBack(client, include, backup);
        targetReport.rollback = "restored_previous_source";
      } catch (rollbackError) {
        targetReport.rollback = `failed: ${rollbackError.message}`;
      }
    }
    throw error;
  } finally {
    if (client.alive) await client.close();
  }
}

report.ok = report.targets.every((target) => target.status.startsWith("deployed"));
process.stdout.write(JSON.stringify(report, null, 2));
