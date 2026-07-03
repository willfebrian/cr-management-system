import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLogger } from "../mcp/sap/audit-logger.mjs";
import { analyzeAbapSource, normalizeZrfcReadReportResult } from "../mcp/sap/abap-source-analyzer.mjs";
import { createSapClients, createSapMaintenanceReadClient } from "../mcp/sap/sap-client-factory.mjs";
import { SapGateway } from "../mcp/sap/sap-gateway.mjs";
import { createSapTools } from "../mcp/sap/tools.mjs";
import { createArtifactPaths } from "../mcp/sap/artifact-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const artifactPaths = createArtifactPaths({ projectRoot });
const argv = process.argv.slice(2);
const command = (argv.shift() || "help").toLowerCase();
const options = parseOptions(argv);
const agentName = "sap_abap_technical_agent";
const userQuestion = `Unified SAP discovery command: ${command}`;
const defaultCrServer = "SAP_DEV_AIX";
const defaultCrOwner = "TRSTDEV";
let gateway;
let tools;

try {
  const result = await dispatch(command, argv, options);
  emit(result, options);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    command,
    message: error.message,
    code: error.code,
    key: error.key,
    stack: options.verbose ? error.stack : undefined
  }, null, 2));
  process.exitCode = 1;
}

async function dispatch(name, args, opts) {
  switch (name) {
    case "help":
    case "--help":
    case "-h":
      return help();
    case "login-test":
      ensureSap();
      return loginTest();
    case "tcode":
      ensureSap();
      return tcodeLookup(requiredArg(args, 0, "tcode"));
    case "table":
      ensureSap();
      return tableRead(requiredArg(args, 0, "tableName"), opts);
    case "cr-list":
      ensureSap();
      return crList(opts);
    case "cr-detail":
      ensureSap();
      return crDetail(requiredArg(args, 0, "transportRequest"), opts);
    case "ddic":
      ensureSap();
      return ddic(requiredArg(args, 0, "tableName"));
    case "abap-read":
      ensureSap();
      return abapRead(requiredArg(args, 0, "programName"), opts);
    case "abap-search":
      ensureSap();
      return abapSearch(requiredArg(args, 0, "programName"), requiredArg(args, 1, "pattern"), opts);
    case "includes":
      ensureSap();
      return includes(requiredArg(args, 0, "programName"), opts);
    case "enhancement":
      ensureSap();
      return enhancementCheck(requiredArg(args, 0, "tcode"), opts);
    case "smartform-graphics":
      ensureSap();
      return smartformGraphics(requiredArg(args, 0, "formName"), opts);
    default:
      throw new Error(`Unknown command "${name}". Run: node scripts/sap-discovery.mjs help`);
  }
}

function ensureSap() {
  if (gateway && tools) return;
  const clients = createSapClients();
  try {
    clients.SAP_DEV_AIX_MAINT = createSapMaintenanceReadClient();
    clients.SAP_DEV_AIX_MAINT = clients.SAP_DEV_AIX_MAINT;
  } catch {
    // Maintenance server is optional for read-only helper RFCs.
  }
  gateway = new SapGateway({
    clients,
    auditLogger: new AuditLogger({
      enabled: process.env.SAP_AUDIT_LOG_ENABLED !== "false",
      logPath: path.join(projectRoot, "logs", "sap-audit.jsonl")
    }),
    timeoutMs: Number(options.timeout || process.env.SAP_RFC_TIMEOUT_MS || 60000)
  });
  tools = createSapTools(gateway);
}

function help() {
  return {
    ok: true,
    usage: [
      "node scripts/sap-discovery.mjs login-test",
      "node scripts/sap-discovery.mjs tcode F-30",
      "node scripts/sap-discovery.mjs table TSTC --fields TCODE,PGMNA,DYPNO --where \"TCODE = 'F-30'\" --row-count 5",
      "node scripts/sap-discovery.mjs cr-list --days 30 --row-count 100 --save",
      "node scripts/sap-discovery.mjs cr-detail DEVK900001 --include-keys --save",
      "node scripts/sap-discovery.mjs ddic BSEG",
      "node scripts/sap-discovery.mjs abap-read SAPMF05A --save",
      "node scripts/sap-discovery.mjs abap-search SAPMF05A \"ENHANCEMENT-POINT\" --depth 1",
      "node scripts/sap-discovery.mjs includes SAPMF05A --depth 2",
      "node scripts/sap-discovery.mjs enhancement F-30 --save",
      "node scripts/sap-discovery.mjs smartform-graphics ZMMF_TTE_PO_LOCAL_PDF --server SAP_DEV_AIX_MAINT --save"
    ],
    notes: [
      "Run from the CR Management System project root so .env and node_modules are correct.",
      "All SAP access goes through SapGateway and ReadOnlyGuard.",
      "Use --save to write evidence under outputs/ad-hoc/.",
      "Use --server SAP_DEV_AIX_MAINT for read-only helper RFCs that exist only on the DEV AIX maintenance server."
    ]
  };
}

async function loginTest() {
  const qa = await tools.sap_table_read_limited_normalized({
    agentName,
    server: "SAP_QA",
    tableName: "T000",
    fields: ["MANDT", "MTEXT"],
    where: ["MANDT <> ''"],
    rowCount: 3,
    userQuestion
  });

  const devAix = await gateway.call({
    agentName,
    server: "SAP_DEV_AIX",
    rfcName: "RFC_GET_FUNCTION_INTERFACE",
    params: { FUNCNAME: "ZRFC_READ_REPORT" },
    userQuestion
  });

  const devNc = await gateway.call({
    agentName,
    server: "SAP_DEV_NC",
    rfcName: "RFC_GET_FUNCTION_INTERFACE",
    params: { FUNCNAME: "ZRFC_READ_REPORT" },
    userQuestion
  });

  const prd = await tools.sap_table_read_limited_normalized({
    agentName,
    server: "SAP_PRD",
    tableName: "T000",
    fields: ["MANDT", "MTEXT"],
    where: ["MANDT <> ''"],
    rowCount: 3,
    userQuestion
  });

  return {
    ok: true,
    checks: {
      SAP_QA: { ok: true, sampleRows: qa.rows },
      SAP_DEV_AIX: {
        ok: true,
        function: "ZRFC_READ_REPORT",
        importCount: devAix?.PARAMS?.length ?? devAix?.PARAMETERS?.length
      },
      SAP_DEV_NC: {
        ok: true,
        function: "ZRFC_READ_REPORT",
        importCount: devNc?.PARAMS?.length ?? devNc?.PARAMETERS?.length
      },
      SAP_PRD: {
        ok: true,
        mode: "read-only smoke/business access; confirmed actions prohibited",
        sampleRows: prd.rows
      }
    }
  };
}

async function tcodeLookup(tcode) {
  const code = tcode.toUpperCase();
  const mapping = await tools.sap_tcode_lookup({ agentName, server: "SAP_QA", tcode: code, userQuestion });
  const text = await tools.sap_table_read_limited_normalized({
    agentName,
    server: "SAP_QA",
    tableName: "TSTCT",
    fields: ["TCODE", "SPRSL", "TTEXT"],
    where: [`TCODE = '${escapeSap(code)}'`, "SPRSL = 'E'"],
    rowCount: 5,
    userQuestion
  }).catch(() => ({ rows: [] }));

  return { ok: true, tcode: code, mapping: mapping.rows[0] || null, text: text.rows[0] || null };
}

async function tableRead(tableName, opts) {
  const fields = csv(opts.fields);
  const where = collect(opts.where);
  const rowCount = Number(opts["row-count"] || opts.rowCount || 100);
  const result = await tools.sap_table_read_limited_normalized({
    agentName,
    server: opts.server || "SAP_QA",
    tableName: tableName.toUpperCase(),
    fields,
    where,
    rowCount,
    userQuestion
  });
  return { ok: true, query: { tableName: tableName.toUpperCase(), fields, where, rowCount }, result };
}

async function crList(opts) {
  const rowCount = Number(opts["row-count"] || opts.rowCount || 100);
  const server = String(opts.server || defaultCrServer).toUpperCase();
  const owner = opts.owner === false ? "" : String(opts.owner || defaultCrOwner).toUpperCase();
  const request = opts.request ? String(opts.request).toUpperCase() : "";
  const status = opts.status ? String(opts.status).toUpperCase() : "";
  const fromDate = normalizeSapDate(opts["from-date"] || opts.fromDate || defaultFromDate(Number(opts.days || 30)));
  const toDate = normalizeSapDate(opts["to-date"] || opts.toDate || "");
  const where = [];

  if (request) where.push(`TRKORR = '${escapeSap(request)}'`);
  else {
    if (fromDate) where.push(`AS4DATE >= '${fromDate}'`);
    if (toDate) where.push(`AS4DATE <= '${toDate}'`);
    if (owner) where.push(`AS4USER = '${escapeSap(owner)}'`);
    if (status) where.push(`TRSTATUS = '${escapeSap(status)}'`);
  }
  if (!where.length) throw new Error("cr-list requires --request or at least one bounded filter");

  const header = await tools.sap_table_read_limited_normalized({
    agentName,
    server,
    tableName: "E070",
    fields: ["TRKORR", "TRFUNCTION", "TRSTATUS", "TARSYSTEM", "KORRDEV", "AS4USER", "AS4DATE", "AS4TIME", "STRKORR"],
    where: [andWhere(where)],
    rowCount,
    userQuestion
  });
  const texts = await readCrTexts(header.rows.map((row) => row.TRKORR), opts.language || "E", server);
  const requests = header.rows.map((row) => normalizeCrHeader(row, texts.get(row.TRKORR)));
  const result = {
    ok: true,
    query: { server, request: request || undefined, owner: owner || undefined, status: status || undefined, fromDate, toDate: toDate || undefined, rowCount },
    count: requests.length,
    summary: summarizeCrStatus(requests),
    requests
  };
  maybeSave(result, "cr-list", opts);
  return result;
}

async function crDetail(transportRequest, opts) {
  const trkorr = String(transportRequest || "").trim().toUpperCase();
  const server = String(opts.server || defaultCrServer).toUpperCase();
  const rowCount = Number(opts["row-count"] || opts.rowCount || 1000);
  const headerRows = await tools.sap_table_read_limited_normalized({
    agentName,
    server,
    tableName: "E070",
    fields: ["TRKORR", "TRFUNCTION", "TRSTATUS", "TARSYSTEM", "KORRDEV", "AS4USER", "AS4DATE", "AS4TIME", "STRKORR"],
    where: [`TRKORR = '${escapeSap(trkorr)}'`],
    rowCount: 1,
    userQuestion
  });
  const taskRows = await tools.sap_table_read_limited_normalized({
    agentName,
    server,
    tableName: "E070",
    fields: ["TRKORR", "TRFUNCTION", "TRSTATUS", "TARSYSTEM", "KORRDEV", "AS4USER", "AS4DATE", "AS4TIME", "STRKORR"],
    where: [`STRKORR = '${escapeSap(trkorr)}'`],
    rowCount,
    userQuestion
  });
  const allHeaders = [...headerRows.rows, ...taskRows.rows];
  const texts = await readCrTexts(allHeaders.map((row) => row.TRKORR), opts.language || "E", server);
  const headers = allHeaders.map((row) => normalizeCrHeader(row, texts.get(row.TRKORR)));
  const keysToRead = [...new Set(headers.map((row) => row.trkorr).filter(Boolean))];
  const objectGroups = [];

  for (const key of keysToRead) {
    const objects = await tools.sap_table_read_limited_normalized({
      agentName,
      server,
      tableName: "E071",
      fields: ["TRKORR", "AS4POS", "PGMID", "OBJECT", "OBJ_NAME"],
      where: [`TRKORR = '${escapeSap(key)}'`],
      rowCount,
      userQuestion
    });
    const objectRows = objects.rows.map(normalizeCrObject);
    const keyRows = opts["include-keys"] || opts.includeKeys
      ? await readCrObjectKeys(key, rowCount, server)
      : [];
    objectGroups.push({ trkorr: key, objectCount: objectRows.length, keyCount: keyRows.length, objects: objectRows, keys: keyRows });
  }

  const result = {
    ok: true,
    server,
    trkorr,
    header: headers.find((row) => row.trkorr === trkorr) || null,
    tasks: headers.filter((row) => row.parentRequest === trkorr),
    counts: {
      taskCount: headers.filter((row) => row.parentRequest === trkorr).length,
      objectCount: objectGroups.reduce((sum, group) => sum + group.objectCount, 0),
      keyCount: objectGroups.reduce((sum, group) => sum + group.keyCount, 0)
    },
    objectGroups,
    notes: [
      "Object list follows SAP transport tables E070/E07T/E071.",
      "Key-level entries are included only when --include-keys is passed and depend on E071K availability.",
      "Detailed before/after diff requires source/version snapshots in a later phase."
    ]
  };
  maybeSave(result, `cr-detail-${trkorr}`, opts);
  return result;
}

async function ddic(tableName) {
  const normalized = await tools.sap_field_metadata_normalized({
    agentName,
    server: "SAP_QA",
    tableName: tableName.toUpperCase(),
    userQuestion
  });
  return { ok: true, ...normalized };
}

async function readCrTexts(transportRequests, language = "E", server = defaultCrServer) {
  const result = new Map();
  for (const trkorr of [...new Set(transportRequests.filter(Boolean))]) {
    const textRows = await readTableSafe(
      "E07T",
      ["TRKORR", "LANGU", "AS4TEXT"],
      [andWhere([`TRKORR = '${escapeSap(trkorr)}'`, `LANGU = '${escapeSap(language)}'`])],
      5,
      server
    );
    const fallbackRows = textRows.rows.length ? textRows : await readTableSafe(
      "E07T",
      ["TRKORR", "LANGU", "AS4TEXT"],
      [`TRKORR = '${escapeSap(trkorr)}'`],
      5,
      server
    );
    result.set(trkorr, fallbackRows.rows[0]?.AS4TEXT || "");
  }
  return result;
}

async function readCrObjectKeys(trkorr, rowCount, server = defaultCrServer) {
  const keyRows = await readTableSafe(
    "E071K",
    ["TRKORR", "AS4POS", "PGMID", "OBJECT", "OBJNAME", "TABKEY"],
    [`TRKORR = '${escapeSap(trkorr)}'`],
    rowCount,
    server
  );
  return keyRows.rows.map((row) => ({
    trkorr: row.TRKORR,
    position: row.AS4POS,
    pgmid: row.PGMID,
    objectType: row.OBJECT,
    objectName: row.OBJNAME || row.OBJ_NAME,
    tableKey: row.TABKEY
  }));
}

function normalizeCrHeader(row, description = "") {
  return {
    trkorr: row.TRKORR,
    parentRequest: row.STRKORR,
    description,
    function: row.TRFUNCTION,
    status: row.TRSTATUS,
    statusGroup: crStatusGroup(row.TRSTATUS),
    targetSystem: row.TARSYSTEM,
    category: row.KORRDEV,
    owner: row.AS4USER,
    changedDate: row.AS4DATE,
    changedTime: row.AS4TIME
  };
}

function normalizeCrObject(row) {
  return {
    trkorr: row.TRKORR,
    position: row.AS4POS,
    pgmid: row.PGMID,
    objectType: row.OBJECT,
    objectName: row.OBJ_NAME || row.OBJNAME,
    objectFunction: row.OBJFUNC,
    lockFlag: row.LOCKFLAG,
    generatedFlag: row.GENFLAG,
    language: row.LANG,
    diffReadiness: crObjectDiffReadiness(row)
  };
}

function crObjectDiffReadiness(row) {
  if (["PROG", "REPS", "FUGR", "CLAS", "INTF", "FUNC"].includes(row.OBJECT)) return "source_snapshot_or_version_compare";
  if (["TABL", "DTEL", "DOMA", "VIEW", "TTYP", "SHLP"].includes(row.OBJECT)) return "ddic_snapshot_or_version_compare";
  if (row.PGMID === "LIMU") return "repository_subobject_compare";
  return "object_or_key_inventory_only";
}

function crStatusGroup(status) {
  const value = String(status || "").trim().toUpperCase();
  if (value === "R") return "released";
  if (!value) return "unknown";
  return "outstanding";
}

function summarizeCrStatus(requests) {
  return requests.reduce((acc, request) => {
    acc[request.statusGroup] = (acc[request.statusGroup] || 0) + 1;
    return acc;
  }, {});
}

function andWhere(conditions) {
  return conditions.filter(Boolean).join(" AND ");
}

async function abapRead(programName, opts) {
  const source = await readSource(programName);
  const result = {
    ok: true,
    program: programName.toUpperCase(),
    lineCount: source.length,
    lines: opts.full ? source : source.slice(0, Number(opts.limit || 80))
  };
  maybeSave(result, `abap-source-${programName.toUpperCase()}`, opts);
  return result;
}

async function abapSearch(programName, pattern, opts) {
  const depth = Number(opts.depth || 0);
  const regex = toRegex(pattern, opts);
  const bundle = await readProgramBundle(programName, depth, Number(opts.maxPrograms || 80));
  const matches = [];
  for (const program of bundle.programs) {
    for (const line of program.lines) {
      if (regex.test(line.text)) matches.push({ program: program.program, lineNumber: line.lineNumber, text: line.text });
    }
  }
  const result = { ok: true, program: programName.toUpperCase(), pattern, depth, programsRead: bundle.programs.length, matches };
  maybeSave(result, `abap-search-${programName.toUpperCase()}`, opts);
  return result;
}

async function includes(programName, opts) {
  const depth = Number(opts.depth || 2);
  const bundle = await readProgramBundle(programName, depth, Number(opts.maxPrograms || 160));
  const result = {
    ok: true,
    rootProgram: programName.toUpperCase(),
    depth,
    programsRead: bundle.programs.map((p) => ({
      program: p.program,
      parent: p.parent,
      depth: p.depth,
      lineCount: p.lines.length,
      includes: p.includes
    })),
    failures: bundle.failures
  };
  maybeSave(result, `includes-${programName.toUpperCase()}`, opts);
  return result;
}

async function enhancementCheck(tcode, opts) {
  const code = tcode.toUpperCase();
  const tcodeInfo = await tcodeLookup(code);
  const rootProgram = tcodeInfo.mapping?.PGMNA;
  if (!rootProgram) throw new Error(`No TSTC program mapping found for ${code}`);

  const bundle = await readProgramBundle(rootProgram, Number(opts.depth || 1), Number(opts.maxPrograms || 60));
  const sourceSignals = scanEnhancementSignals(bundle.programs);
  const cmod = await findCmodForSignals(sourceSignals.customerFunctionCalls);
  const sapmf05aExitComponents = rootProgram === "SAPMF05A" ? await findCmodComponentsByPattern("EXIT_SAPMF05A%") : [];
  const badi = await findClassicBadiForSignals(sourceSignals.badiCalls);
  const enhFramework = await findEnhancementFramework(rootProgram, bundle.programs.map((p) => p.program));
  const enhDetails = await repositoryDetails([...new Set(enhFramework.map((x) => x.row?.ENHNAME).filter(Boolean))]);
  const customEnhancements = enhDetails.filter((x) => x.repositoryRows.some((row) => !/^SAP$/i.test(row.SRCSYSTEM || "")));

  const result = {
    ok: true,
    tcode: code,
    mapping: tcodeInfo.mapping,
    text: tcodeInfo.text,
    counts: {
      programsRead: bundle.programs.length,
      customerFunctionCalls: sourceSignals.customerFunctionCalls.length,
      badiCalls: sourceSignals.badiCalls.length,
      enhancementPoints: sourceSignals.enhancementPoints.length,
      activeCmodMatches: cmod.length,
      availableSapmf05aExitComponents: sapmf05aExitComponents.length,
      activeBadiMatches: badi.length,
      enhancementFrameworkMatches: enhFramework.length,
      enhancementRepositoryDetails: enhDetails.length,
      customEnhancements: customEnhancements.length
    },
    sourceSignals,
    activeCmodMatches: cmod,
    availableSapmf05aExitComponents: sapmf05aExitComponents,
    activeBadiMatches: badi,
    enhancementFrameworkMatches: uniqueEnhancementMatches(enhFramework),
    enhancementRepositoryDetails: enhDetails,
    customEnhancements
  };
  maybeSave(result, `enhancement-${code.replace(/[^A-Z0-9]+/g, "_")}`, opts);
  return result;
}

async function smartformGraphics(formName, opts) {
  const normalizedFormName = formName.toUpperCase();
  const raw = await gateway.call({
    agentName,
    server: opts.server || "SAP_DEV_AIX",
    rfcName: "ZRFC_SMARTFORM_GRAPHICS_READ",
    params: {
      IV_FORMNAME: normalizedFormName,
      ET_GRAPHICS: []
    },
    userQuestion
  });
  const graphics = Array.isArray(raw?.ET_GRAPHICS) ? raw.ET_GRAPHICS.map((row) => ({
    formName: row.FORMNAME,
    nodeName: row.NODE_NAME,
    nodeCaption: row.NODE_CAPTION,
    graphicName: row.GRAPHIC_NAME,
    graphicObject: row.GRAPHIC_OBJECT,
    graphicId: row.GRAPHIC_ID,
    graphicBtype: row.GRAPHIC_BTYPE,
    source: row.SOURCE,
    message: row.MESSAGE
  })) : [];
  const result = {
    ok: true,
    formName: normalizedFormName,
    count: graphics.length,
    graphics,
    raw: opts.raw ? raw : undefined
  };
  maybeSave(result, `smartform-graphics-${normalizedFormName}`, opts);
  return result;
}

async function readSource(programName) {
  const raw = await tools.z_read_abap_report({ agentName, programName: programName.toUpperCase(), userQuestion });
  return normalizeZrfcReadReportResult(raw).sourceLines;
}

async function readProgramBundle(root, maxDepth, maxPrograms) {
  const queue = [{ program: root, depth: 0, parent: null }];
  const seen = new Set();
  const programs = [];
  const failures = [];
  while (queue.length && programs.length < maxPrograms) {
    const item = queue.shift();
    const name = String(item.program || "").trim().toUpperCase();
    if (!name || seen.has(name) || item.depth > maxDepth) continue;
    seen.add(name);
    try {
      const lines = await readSource(name);
      const analysis = analyzeAbapSource(lines);
      const includes = analysis.includes.map((x) => x.value);
      programs.push({ ...item, program: name, lines, includes });
      if (item.depth < maxDepth) {
        for (const include of includes) queue.push({ program: include, depth: item.depth + 1, parent: name });
      }
    } catch (error) {
      failures.push({ program: name, parent: item.parent, depth: item.depth, message: error.message, code: error.code });
    }
  }
  return { programs, failures };
}

function scanEnhancementSignals(programs) {
  const customerFunctionCalls = [];
  const badiCalls = [];
  const enhancementPoints = [];

  for (const program of programs) {
    for (const line of program.lines) {
      const text = line.text || "";
      let match = text.match(/CALL\s+CUSTOMER-FUNCTION\s+['`]([0-9A-Z_]+)['`]/i);
      if (match) {
        customerFunctionCalls.push({
          program: program.program,
          lineNumber: line.lineNumber,
          customerFunction: match[1],
          exitFunction: `EXIT_${program.program}_${match[1].padStart(3, "0")}`,
          text: text.trim()
        });
      }

      match = text.match(/\b(?:GET|CALL)\s+BADI\s+([A-Z0-9_]+)/i);
      if (match) badiCalls.push({ program: program.program, lineNumber: line.lineNumber, badiName: match[1].toUpperCase(), text: text.trim() });

      match = text.match(/CL_EXITHANDLER=>GET_INSTANCE[\s\S]*?EXIT_NAME\s*=\s*['`]([A-Z0-9_]+)['`]/i);
      if (match) badiCalls.push({ program: program.program, lineNumber: line.lineNumber, exitName: match[1].toUpperCase(), text: text.trim() });

      if (/\bENHANCEMENT-(POINT|SECTION)\b/i.test(text)) {
        enhancementPoints.push({ program: program.program, lineNumber: line.lineNumber, text: text.trim() });
      }
    }
  }

  return { customerFunctionCalls, badiCalls, enhancementPoints };
}

async function findCmodForSignals(customerFunctionCalls) {
  const exitNames = new Set(customerFunctionCalls.map((x) => x.exitFunction).filter(Boolean));
  if (!exitNames.size) return [];
  const matches = [];
  for (const exitName of exitNames) {
    const components = await readTableSafe("MODSAP", ["NAME", "TYP", "MEMBER"], [`MEMBER = '${escapeSap(exitName)}'`], 100);
    for (const component of components.rows) {
      const assignments = await readTableSafe("MODACT", ["NAME", "TYP", "MEMBER", "DEVCLASS"], [`MEMBER = '${escapeSap(component.NAME)}'`], 100);
      for (const assignment of assignments.rows) {
        const projects = await readTableSafe("MODATTR", ["NAME", "STATUS", "ANAM", "ADAT"], [`NAME = '${escapeSap(assignment.NAME)}'`], 20);
        for (const project of projects.rows.filter((x) => isActiveStatus(x.STATUS))) {
          matches.push({ project, assignment, component });
        }
      }
    }
  }
  return matches;
}

async function findCmodComponentsByPattern(pattern) {
  const components = await readTableSafe("MODSAP", ["NAME", "TYP", "MEMBER"], [`MEMBER LIKE '${escapeSap(pattern)}'`], 500);
  const result = [];
  for (const component of components.rows) {
    const assignments = await readTableSafe("MODACT", ["NAME", "TYP", "MEMBER", "DEVCLASS"], [`MEMBER = '${escapeSap(component.NAME)}'`], 100);
    const activeProjects = [];
    for (const assignment of assignments.rows) {
      const projects = await readTableSafe("MODATTR", ["NAME", "STATUS", "ANAM", "ADAT"], [`NAME = '${escapeSap(assignment.NAME)}'`], 20);
      activeProjects.push(...projects.rows.filter((x) => isActiveStatus(x.STATUS)));
    }
    result.push({ enhancementName: component.NAME, componentName: component.MEMBER, componentType: component.TYP, activeProjectCount: activeProjects.length, activeProjects });
  }
  return result;
}

async function findClassicBadiForSignals(badiCalls) {
  const names = new Set(badiCalls.flatMap((x) => [x.badiName, x.exitName]).filter(Boolean));
  if (!names.size) return [];
  const matches = [];
  for (const table of ["SXC_ATTR", "SXC_EXIT"]) {
    const fields = await tableFields(table);
    const exitField = firstField(fields, ["EXIT_NAME", "BADI_NAME", "NAME"]);
    const implField = firstField(fields, ["IMP_NAME", "IMPL_NAME", "IMPLEMENTATION", "IMPL"]);
    const activeField = firstField(fields, ["ACTIVE", "STATE", "VERSION"]);
    if (!exitField || !implField) continue;
    for (const name of names) {
      const rows = await readTableSafe(table, [exitField, implField, activeField].filter(Boolean), [`${exitField} = '${escapeSap(name)}'`], 200);
      matches.push(...rows.rows.map((row) => ({ table, badiName: name, row })));
    }
  }
  return matches;
}

async function findEnhancementFramework(rootProgram, programNames) {
  const matches = [];
  const fields = await tableFields("ENHOBJ");
  const objField = firstField(fields, ["OBJ_NAME", "OBJECT_NAME", "INCLUDE", "PROGRAM", "PGMNAME", "OBJNAME"]);
  const enhField = firstField(fields, ["ENHNAME", "ENH_NAME", "NAME", "IMP_NAME"]);
  const versionField = firstField(fields, ["VERSION", "ACTIVE", "STATE", "STATUS"]);
  if (!objField || !enhField) return [];
  for (const objectName of [...new Set([rootProgram, ...programNames].filter(Boolean))].slice(0, 80)) {
    const rows = await readTableSafe("ENHOBJ", [enhField, objField, versionField].filter(Boolean), [`${objField} = '${escapeSap(objectName)}'`], 200);
    matches.push(...rows.rows.map((row) => ({ table: "ENHOBJ", matchObject: objectName, row })));
  }
  return matches;
}

async function repositoryDetails(objectNames) {
  const details = [];
  for (const name of objectNames) {
    const rows = await readTableSafe("TADIR", ["PGMID", "OBJECT", "OBJ_NAME", "DEVCLASS", "SRCSYSTEM"], [`OBJ_NAME = '${escapeSap(name)}'`], 20);
    details.push({ objectName: name, repositoryRows: rows.rows });
  }
  return details;
}

async function tableFields(tableName, server = "SAP_QA") {
  try {
    const meta = await tools.sap_field_metadata_normalized({ agentName, server, tableName, userQuestion });
    return meta.fields.map((x) => x.fieldName).filter(Boolean);
  } catch {
    return [];
  }
}

async function readTableSafe(tableName, fields, where, rowCount, server = "SAP_QA") {
  try {
    return await tools.sap_table_read_limited_normalized({ agentName, server, tableName, fields, where, rowCount, userQuestion });
  } catch (error) {
    return { rowCount: 0, rows: [], error: { message: error.message, code: error.code, key: error.key } };
  }
}

function maybeSave(result, stem, opts) {
  if (!opts.save) return;
  const dir = artifactPaths.outputPath("ad-hoc");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stem}-${timestamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  result.savedEvidence = path.relative(projectRoot, file).replaceAll("\\", "/");
}

function emit(result, opts) {
  if (opts.save && !result.savedEvidence) maybeSave(result, `${command}-${Date.now()}`, opts);
  console.log(JSON.stringify(result, null, Number(opts.compact ? 0 : 2)));
}

function parseOptions(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const raw = token.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
    if (inlineValue !== undefined) {
      appendOption(options, key, inlineValue);
    } else if (index + 1 < args.length && !args[index + 1].startsWith("--")) {
      appendOption(options, key, args[++index]);
    } else {
      appendOption(options, key, true);
    }
  }
  args.length = 0;
  args.push(...positional);
  return options;
}

function appendOption(options, key, value) {
  if (options[key] === undefined) options[key] = value;
  else if (Array.isArray(options[key])) options[key].push(value);
  else options[key] = [options[key], value];
}

function collect(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function csv(value) {
  if (!value) return [];
  const joined = Array.isArray(value) ? value.join(",") : String(value);
  return joined.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
}

function requiredArg(args, index, name) {
  const value = args[index];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function toRegex(pattern, opts) {
  if (opts.regex) return new RegExp(pattern, opts.ignoreCase === false ? "" : "i");
  return new RegExp(escapeRegExp(pattern), opts.ignoreCase === false ? "" : "i");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defaultFromDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(Number.isFinite(days) ? days : 30, 1));
  return sapDate(date);
}

function normalizeSapDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{8}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll("-", "");
  throw new Error(`Invalid SAP date "${text}". Use YYYYMMDD or YYYY-MM-DD.`);
}

function sapDate(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function escapeSap(value) {
  return String(value || "").replaceAll("'", "''").toUpperCase();
}

function firstField(fields, names) {
  return names.find((name) => fields.includes(name));
}

function isActiveStatus(status) {
  return /^(A|ACT|ACTIVE)$/i.test(String(status || "").trim());
}

function uniqueEnhancementMatches(matches) {
  const seen = new Set();
  return matches.filter((match) => {
    const key = `${match.table}|${match.matchObject}|${match.row?.ENHNAME}|${match.row?.VERSION}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}





