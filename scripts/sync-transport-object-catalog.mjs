import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { fetchTransportObjectCatalog } from "../mcp/sap/transport-object-catalog.mjs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { AuditLogger } from "../mcp/sap/audit-logger.mjs";
import { createSapClients } from "../mcp/sap/sap-client-factory.mjs";
import { SapGateway } from "../mcp/sap/sap-gateway.mjs";

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
const snapshotPath = path.join(projectRoot, "src/shared/transportObjectCatalog.json");
let standardPairs = new Map();
let database;
let transactionOpen = false;

try {
  if (language !== "E") throw new Error("The application catalog requires English descriptions");
  const snapshot = process.argv.includes("--from-snapshot")
    ? JSON.parse(await fs.readFile(snapshotPath, "utf8"))
    : { sourceServer: sapServer, sourceSystemCode, language, verifiedAt: new Date().toISOString(),
        rows: await fetchTransportObjectCatalog(gateway, { server: sapServer, language }) };
  if (snapshot.language !== language || snapshot.sourceServer !== sapServer || snapshot.sourceSystemCode !== sourceSystemCode) throw new Error("Catalog snapshot source or language does not match");
  standardPairs = new Map(snapshot.rows.filter(row => row.description).map(row => [`${row.pgmid} ${row.objectType}`, row]));
  if (!standardPairs.has("LIMU REPS") || !standardPairs.has("R3TR PROG")) throw new Error("Incomplete standard CTS catalog");
  if (!process.argv.includes("--snapshot-only")) {
  database = await pool.connect();
  await database.query("BEGIN");
  transactionOpen = true;
  await ensureTables();

  const [programIds, objectTypes, pairRows] = await Promise.all([
    Promise.resolve(new Map(fallbackProgramIds)),
    Promise.resolve(new Map(snapshot.rows.filter(row => row.description).map(row => [row.objectType, row.description]))),
    database.query(`
      SELECT DISTINCT upper(trim(pgmid)) AS pgmid, upper(trim(object_type)) AS object_type
      FROM cr_objects
      WHERE NULLIF(trim(coalesce(pgmid, '')), '') IS NOT NULL
        AND NULLIF(trim(coalesce(object_type, '')), '') IS NOT NULL
      ORDER BY upper(trim(pgmid)), upper(trim(object_type))
    `)
  ]);

  mergeFallback(programIds, fallbackProgramIds);


  await upsertProgramIds(programIds);
  await upsertObjectTypes(objectTypes);
  const pairs = new Map(pairRows.rows.map(row => [`${row.pgmid} ${row.object_type}`, row]));
  for (const row of snapshot.rows) pairs.set(`${row.pgmid} ${row.objectType}`, { pgmid: row.pgmid, object_type: row.objectType });
  await upsertObservedPairs([...pairs.values()], programIds, objectTypes);

  await database.query("COMMIT");
  transactionOpen = false;
  console.log(JSON.stringify({
    ok: true,
    sourceServer: sapServer,
    sourceSystemCode,
    language,
    programIds: programIds.size,
    objectTypes: objectTypes.size,
    observedPairs: pairRows.rows.length
  }, null, 2));
  }
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
} catch (error) {
  if (transactionOpen) await database.query("ROLLBACK");
  throw error;
} finally {
  database?.release();
  await gateway.closeAll?.();
  await pool.end();
}

async function ensureTables() {
  await database.query(`
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

    ALTER TABLE sap_transport_object_catalog ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'E';
    ALTER TABLE sap_transport_object_catalog ADD COLUMN IF NOT EXISTS description_source TEXT;
    CREATE INDEX IF NOT EXISTS idx_sap_transport_object_catalog_label
      ON sap_transport_object_catalog(display_label);
  `);
}

async function upsertProgramIds(programIds) {
  for (const [pgmid, description] of programIds) {
    await database.query(`
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
    await database.query(`
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
      await database.query(`
        INSERT INTO sap_transport_program_ids (pgmid, description, language, source_system_code, updated_at)
        VALUES ($1, $1, $2, $3, now())
        ON CONFLICT (pgmid) DO NOTHING
      `, [pgmid, language, sourceSystemCode]);
    }

    if (!objectTypes.has(objectType)) {
      await database.query(`
        INSERT INTO sap_transport_object_types (object_type, description, language, source_system_code, updated_at)
        VALUES ($1, $1, $2, $3, now())
        ON CONFLICT (object_type) DO NOTHING
      `, [objectType, language, sourceSystemCode]);
    }

    const pairKey = `${pgmid} ${objectType}`.trim().toUpperCase();
    await database.query(`
      INSERT INTO sap_transport_object_catalog (pgmid, object_type, display_label, source_system_code, language, description_source, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (pgmid, object_type) DO UPDATE SET
        display_label = COALESCE(NULLIF(EXCLUDED.display_label, ''), sap_transport_object_catalog.display_label),
        language = EXCLUDED.language,
        description_source = COALESCE(EXCLUDED.description_source, sap_transport_object_catalog.description_source),
        source_system_code = EXCLUDED.source_system_code,
        updated_at = now()
    `, [pgmid, objectType, standardPairs.get(pairKey)?.description || null, sourceSystemCode, language, standardPairs.get(pairKey)?.descriptionSource || null]);
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
