import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { AuditLogger } from "../mcp/sap/audit-logger.mjs";
import { createSapClients } from "../mcp/sap/sap-client-factory.mjs";
import { SapGateway } from "../mcp/sap/sap-gateway.mjs";
import { createSapTools } from "../mcp/sap/tools.mjs";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const schemaName = process.env.PGSCHEMA || "cr_management";
const sapServer = process.env.SAP_TRANSPORT_CATALOG_SOURCE_SERVER || "SAP_DEV_AIX";
const language = process.env.SAP_TRANSPORT_CATALOG_LANGUAGE || "E";
const sourceSystemCode = process.env.SAP_TRANSPORT_CATALOG_SOURCE_SYSTEM || "DEV";
const fallbackProgramIds = new Map(Object.entries({
  CORR: "Correction and transport entry",
  LIMU: "Repository sub-object",
  R3TR: "Repository object"
}));
const fallbackObjectTypes = new Map(Object.entries({
  ADIR: "Object directory entry",
  AUTH: "Authorization object",
  BSVS: "Status schema",
  CDAT: "Customizing data",
  CINS: "BC set content",
  CLAS: "Class",
  CINC: "Class include",
  CLSD: "Class definition",
  CMOD: "Enhancement project",
  CORR: "Correction",
  CPUB: "Class public section",
  CPRI: "Class private section",
  CPRO: "Class protected section",
  CUAD: "GUI status",
  DEVC: "Package",
  DOCU: "Documentation",
  DOMA: "Domain",
  DOMD: "Domain definition",
  DTEL: "Data element",
  DTED: "Data element definition",
  DYNP: "Screen",
  ENHO: "Enhancement implementation",
  ENHS: "Enhancement spot",
  FUNC: "Function module",
  FUGR: "Function group",
  FUGT: "Function group text",
  INDX: "Technical index object",
  INTF: "Interface",
  MESS: "Message",
  METH: "Class method",
  MSAG: "Message class",
  NOTE: "SAP Note",
  PRIN: "Print object",
  PROG: "Program",
  RELE: "Release information",
  REPS: "Source/include ABAP",
  REPT: "Program text",
  SHLP: "Search help",
  SBXL: "Business object extension",
  SBXP: "Business object extension part",
  SCVI: "View cluster",
  SPDV: "Standard variant",
  SSFO: "Smart Form",
  SSST: "Smart Style",
  STVI: "View cluster object",
  SUSC: "Authorization field",
  SUSO: "Authorization object",
  SXCI: "Customer enhancement implementation",
  TABD: "Table contents",
  TABL: "Table",
  TABT: "Table text",
  TABU: "Table contents",
  TDAT: "Table technical settings",
  TEXT: "Text object",
  TOBJ: "Transport object",
  TRAN: "Transaction",
  TTYP: "Table type",
  VARX: "Variant",
  VDAT: "View data",
  XSLT: "XSLT transformation",
  VIEW: "View"
}));
const fallbackPairLabels = new Map(Object.entries({
  "CORR RELE": "Release information",
  "LIMU CINC": "Class include",
  "LIMU CLSD": "Class definition",
  "LIMU CPUB": "Class public section",
  "LIMU CPRI": "Class private section",
  "LIMU CPRO": "Class protected section",
  "LIMU CUAD": "GUI status",
  "LIMU FUNC": "Function module",
  "LIMU FUGT": "Function group text",
  "LIMU METH": "Class method",
  "LIMU REPS": "Source/include ABAP",
  "LIMU REPT": "Program text",
  "LIMU TABD": "Table contents",
  "R3TR CLAS": "Class",
  "R3TR DOMA": "Domain",
  "R3TR DTEL": "Data element",
  "R3TR ENHO": "Enhancement implementation",
  "R3TR ENHS": "Enhancement spot",
  "R3TR FUGR": "Function group",
  "R3TR INTF": "Interface",
  "R3TR MSAG": "Message class",
  "R3TR PROG": "Program",
  "R3TR SHLP": "Search help",
  "R3TR TABL": "Table",
  "R3TR TRAN": "Transaction",
  "R3TR TTYP": "Table type",
  "R3TR VIEW": "View"
}));

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, options: `-c search_path=${schemaName},public` }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        options: `-c search_path=${schemaName},public`
      }
);

const gateway = new SapGateway({
  clients: createSapClients(),
  auditLogger: new AuditLogger({
    enabled: process.env.SAP_AUDIT_LOG_ENABLED !== "false",
    logPath: path.join(projectRoot, "logs", "sap-audit.jsonl")
  }),
  timeoutMs: Number(process.env.SAP_RFC_TIMEOUT_MS || 60000)
});
const tools = createSapTools(gateway);

try {
  await ensureTables();

  const [programIds, objectTypes, pairRows] = await Promise.all([
    fetchDomainTexts("PGMID", 500),
    fetchDomainTexts("OBJECT", 5000),
    pool.query(`
      SELECT DISTINCT upper(trim(pgmid)) AS pgmid, upper(trim(object_type)) AS object_type
      FROM cr_objects
      WHERE NULLIF(trim(coalesce(pgmid, '')), '') IS NOT NULL
        AND NULLIF(trim(coalesce(object_type, '')), '') IS NOT NULL
      ORDER BY upper(trim(pgmid)), upper(trim(object_type))
    `)
  ]);

  mergeFallback(programIds, fallbackProgramIds);
  mergeFallback(objectTypes, fallbackObjectTypes);

  await upsertProgramIds(programIds);
  await upsertObjectTypes(objectTypes);
  await upsertObservedPairs(pairRows.rows, programIds, objectTypes);

  console.log(JSON.stringify({
    ok: true,
    sourceServer: sapServer,
    sourceSystemCode,
    language,
    programIds: programIds.size,
    objectTypes: objectTypes.size,
    observedPairs: pairRows.rows.length
  }, null, 2));
} finally {
  await gateway.closeAll?.();
  await pool.end();
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sap_transport_program_ids (
      pgmid TEXT PRIMARY KEY,
      description TEXT,
      language TEXT NOT NULL DEFAULT 'E',
      source_system_code TEXT NOT NULL DEFAULT 'DEV',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sap_transport_object_types (
      object_type TEXT PRIMARY KEY,
      description TEXT,
      language TEXT NOT NULL DEFAULT 'E',
      source_system_code TEXT NOT NULL DEFAULT 'DEV',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sap_transport_object_catalog (
      pgmid TEXT NOT NULL REFERENCES sap_transport_program_ids(pgmid) ON DELETE CASCADE,
      object_type TEXT NOT NULL REFERENCES sap_transport_object_types(object_type) ON DELETE CASCADE,
      display_label TEXT,
      source_system_code TEXT NOT NULL DEFAULT 'DEV',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (pgmid, object_type)
    );

    CREATE INDEX IF NOT EXISTS idx_sap_transport_object_catalog_label
      ON sap_transport_object_catalog(display_label);
  `);
}

async function fetchDomainTexts(domainName, rowCount) {
  const result = await tools.sap_domain_texts_normalized({
    agentName: "sap_abap_technical_agent",
    server: sapServer,
    domainName,
    language,
    rowCount,
    userQuestion: `Sync SAP transport object catalog domain ${domainName}`
  });
  const texts = new Map();
  for (const row of result.texts || []) {
    const value = clean(row.value);
    if (!value) continue;
    texts.set(value, clean(row.text) || value);
  }
  return texts;
}

async function upsertProgramIds(programIds) {
  for (const [pgmid, description] of programIds) {
    await pool.query(`
      INSERT INTO sap_transport_program_ids (pgmid, description, language, source_system_code, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (pgmid) DO UPDATE SET
        description = EXCLUDED.description,
        language = EXCLUDED.language,
        source_system_code = EXCLUDED.source_system_code,
        updated_at = now()
    `, [pgmid, description, language, sourceSystemCode]);
  }
}

async function upsertObjectTypes(objectTypes) {
  for (const [objectType, description] of objectTypes) {
    await pool.query(`
      INSERT INTO sap_transport_object_types (object_type, description, language, source_system_code, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (object_type) DO UPDATE SET
        description = EXCLUDED.description,
        language = EXCLUDED.language,
        source_system_code = EXCLUDED.source_system_code,
        updated_at = now()
    `, [objectType, description, language, sourceSystemCode]);
  }
}

async function upsertObservedPairs(pairs, programIds, objectTypes) {
  for (const row of pairs) {
    const pgmid = clean(row.pgmid);
    const objectType = clean(row.object_type);
    if (!pgmid || !objectType) continue;

    if (!programIds.has(pgmid)) {
      await pool.query(`
        INSERT INTO sap_transport_program_ids (pgmid, description, language, source_system_code, updated_at)
        VALUES ($1, $1, $2, $3, now())
        ON CONFLICT (pgmid) DO NOTHING
      `, [pgmid, language, sourceSystemCode]);
    }

    if (!objectTypes.has(objectType)) {
      await pool.query(`
        INSERT INTO sap_transport_object_types (object_type, description, language, source_system_code, updated_at)
        VALUES ($1, $1, $2, $3, now())
        ON CONFLICT (object_type) DO NOTHING
      `, [objectType, language, sourceSystemCode]);
    }

    const pairKey = `${pgmid} ${objectType}`.trim().toUpperCase();
    await pool.query(`
      INSERT INTO sap_transport_object_catalog (pgmid, object_type, display_label, source_system_code, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (pgmid, object_type) DO UPDATE SET
        display_label = EXCLUDED.display_label,
        source_system_code = EXCLUDED.source_system_code,
        updated_at = now()
    `, [pgmid, objectType, fallbackPairLabels.get(pairKey) || objectTypes.get(objectType) || objectType, sourceSystemCode]);
  }
}

function mergeFallback(target, fallback) {
  for (const [key, value] of fallback) {
    if (!target.has(key)) target.set(key, value);
  }
}

function clean(value) {
  return String(value || "").trim();
}
