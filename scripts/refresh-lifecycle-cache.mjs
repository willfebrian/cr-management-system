import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const schema = process.env.PGSCHEMA || "cr_management";
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
  for (const targetSystemCode of ["QA", "PRD"]) {
    const result = await pool.query(`
      INSERT INTO cr_transport_lifecycle (
        source_system_code, trkorr, target_system_code, transport_status, evidence_source,
        import_date, import_time, message, last_checked_at, updated_at
      )
      SELECT
        'DEV',
        dev.trkorr,
        $1,
        CASE WHEN target.trkorr IS NULL THEN 'pending' ELSE 'imported' END,
        CASE WHEN target.trkorr IS NULL THEN 'unknown' ELSE 'inferred' END,
        CASE WHEN target.trkorr IS NULL THEN NULL ELSE target.changed_date END,
        CASE WHEN target.trkorr IS NULL THEN NULL ELSE target.changed_time END,
        CASE WHEN target.trkorr IS NULL THEN 'No matching parent CR found in target cache.' ELSE 'Inferred from matching parent CR in target cache.' END,
        now(),
        now()
      FROM cr_requests dev
      LEFT JOIN cr_requests target
        ON target.sap_system_code = $1
        AND target.parent_request IS NULL
        AND target.trkorr = dev.trkorr
      WHERE dev.sap_system_code = 'DEV'
        AND dev.parent_request IS NULL
        AND dev.status_group = 'released'
      ON CONFLICT (source_system_code, trkorr, target_system_code) DO UPDATE SET
        transport_status = CASE
          WHEN cr_transport_lifecycle.evidence_source = 'confirmed' THEN cr_transport_lifecycle.transport_status
          ELSE EXCLUDED.transport_status
        END,
        evidence_source = CASE
          WHEN cr_transport_lifecycle.evidence_source = 'confirmed' THEN cr_transport_lifecycle.evidence_source
          ELSE EXCLUDED.evidence_source
        END,
        import_date = CASE
          WHEN cr_transport_lifecycle.evidence_source = 'confirmed' THEN cr_transport_lifecycle.import_date
          ELSE EXCLUDED.import_date
        END,
        import_time = CASE
          WHEN cr_transport_lifecycle.evidence_source = 'confirmed' THEN cr_transport_lifecycle.import_time
          ELSE EXCLUDED.import_time
        END,
        message = CASE
          WHEN cr_transport_lifecycle.evidence_source = 'confirmed' THEN cr_transport_lifecycle.message
          ELSE EXCLUDED.message
        END,
        last_checked_at = now(),
        updated_at = now()
    `, [targetSystemCode]);
    results.push({ targetSystemCode, affected: result.rowCount });
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await pool.end();
}
