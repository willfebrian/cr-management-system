import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const apply = process.argv.includes("--apply");
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

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const preview = await client.query(`
    WITH lifecycle_dates AS (
      SELECT
        h.id AS issue_id,
        qa.qa_import_date,
        prd.prd_import_date,
        dev.dev_tested_date,
        dev.dev_evaluated_date,
        qa_t.qa_tested_date,
        qa_t.qa_evaluated_date,
        prd_t.prd_requested_date,
        prd_t.approval_date
      FROM issue_headers h
      LEFT JOIN issue_dev_timeline dev ON dev.issue_id = h.id
      LEFT JOIN issue_qa_timeline qa_t ON qa_t.issue_id = h.id
      LEFT JOIN issue_prd_timeline prd_t ON prd_t.issue_id = h.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(l.import_date, l.imported_at::date) AS qa_import_date
        FROM issue_cr_links link
        JOIN cr_transport_lifecycle l
          ON l.source_system_code = 'DEV'
          AND l.target_system_code = 'QA'
          AND l.trkorr = link.trkorr
          AND l.transport_status = 'imported'
        WHERE link.issue_id = h.id
          AND COALESCE(l.import_date, l.imported_at::date) IS NOT NULL
        ORDER BY link.is_primary DESC, COALESCE(l.import_date, l.imported_at::date) DESC
        LIMIT 1
      ) qa ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(l.import_date, l.imported_at::date) AS prd_import_date
        FROM issue_cr_links link
        JOIN cr_transport_lifecycle l
          ON l.source_system_code = 'DEV'
          AND l.target_system_code = 'PRD'
          AND l.trkorr = link.trkorr
          AND l.transport_status = 'imported'
        WHERE link.issue_id = h.id
          AND COALESCE(l.import_date, l.imported_at::date) IS NOT NULL
        ORDER BY link.is_primary DESC, COALESCE(l.import_date, l.imported_at::date) DESC
        LIMIT 1
      ) prd ON true
      WHERE lower(coalesce(h.issue_status, '')) = 'open'
    )
    SELECT
      COUNT(*)::int AS open_issues,
      COUNT(*) FILTER (WHERE qa_import_date IS NOT NULL)::int AS open_with_qa_date,
      COUNT(*) FILTER (WHERE prd_import_date IS NOT NULL)::int AS open_with_prd_date,
      COUNT(*) FILTER (WHERE qa_import_date IS NOT NULL AND dev_tested_date IS NULL)::int AS dev_tested_to_fill,
      COUNT(*) FILTER (WHERE qa_import_date IS NOT NULL AND dev_evaluated_date IS NULL)::int AS dev_evaluated_to_fill,
      COUNT(*) FILTER (WHERE prd_import_date IS NOT NULL AND qa_tested_date IS NULL)::int AS qa_tested_to_fill,
      COUNT(*) FILTER (WHERE prd_import_date IS NOT NULL AND qa_evaluated_date IS NULL)::int AS qa_evaluated_to_fill,
      COUNT(*) FILTER (WHERE prd_import_date IS NOT NULL AND prd_requested_date IS NULL)::int AS prd_requested_to_fill,
      COUNT(*) FILTER (WHERE prd_import_date IS NOT NULL AND approval_date IS NULL)::int AS approval_to_fill
    FROM lifecycle_dates
  `);

  const devResult = await client.query(`
    WITH source_dates AS (
      SELECT h.id AS issue_id, qa.qa_import_date
      FROM issue_headers h
      LEFT JOIN LATERAL (
        SELECT COALESCE(l.import_date, l.imported_at::date) AS qa_import_date
        FROM issue_cr_links link
        JOIN cr_transport_lifecycle l
          ON l.source_system_code = 'DEV'
          AND l.target_system_code = 'QA'
          AND l.trkorr = link.trkorr
          AND l.transport_status = 'imported'
        WHERE link.issue_id = h.id
          AND COALESCE(l.import_date, l.imported_at::date) IS NOT NULL
        ORDER BY link.is_primary DESC, COALESCE(l.import_date, l.imported_at::date) DESC
        LIMIT 1
      ) qa ON true
      WHERE lower(coalesce(h.issue_status, '')) = 'open'
        AND qa.qa_import_date IS NOT NULL
    )
    INSERT INTO issue_dev_timeline (issue_id, dev_tested_date, dev_evaluated_date, updated_at)
    SELECT issue_id, qa_import_date, qa_import_date, now()
    FROM source_dates
    ON CONFLICT (issue_id) DO UPDATE SET
      dev_tested_date = COALESCE(issue_dev_timeline.dev_tested_date, EXCLUDED.dev_tested_date),
      dev_evaluated_date = COALESCE(issue_dev_timeline.dev_evaluated_date, EXCLUDED.dev_evaluated_date),
      updated_at = CASE
        WHEN issue_dev_timeline.dev_tested_date IS NULL OR issue_dev_timeline.dev_evaluated_date IS NULL THEN now()
        ELSE issue_dev_timeline.updated_at
      END
    WHERE issue_dev_timeline.dev_tested_date IS NULL
       OR issue_dev_timeline.dev_evaluated_date IS NULL
  `);

  const qaResult = await client.query(`
    WITH source_dates AS (
      SELECT h.id AS issue_id, prd.prd_import_date
      FROM issue_headers h
      LEFT JOIN LATERAL (
        SELECT COALESCE(l.import_date, l.imported_at::date) AS prd_import_date
        FROM issue_cr_links link
        JOIN cr_transport_lifecycle l
          ON l.source_system_code = 'DEV'
          AND l.target_system_code = 'PRD'
          AND l.trkorr = link.trkorr
          AND l.transport_status = 'imported'
        WHERE link.issue_id = h.id
          AND COALESCE(l.import_date, l.imported_at::date) IS NOT NULL
        ORDER BY link.is_primary DESC, COALESCE(l.import_date, l.imported_at::date) DESC
        LIMIT 1
      ) prd ON true
      WHERE lower(coalesce(h.issue_status, '')) = 'open'
        AND prd.prd_import_date IS NOT NULL
    )
    INSERT INTO issue_qa_timeline (issue_id, qa_tested_date, qa_evaluated_date, updated_at)
    SELECT issue_id, prd_import_date, prd_import_date, now()
    FROM source_dates
    ON CONFLICT (issue_id) DO UPDATE SET
      qa_tested_date = COALESCE(issue_qa_timeline.qa_tested_date, EXCLUDED.qa_tested_date),
      qa_evaluated_date = COALESCE(issue_qa_timeline.qa_evaluated_date, EXCLUDED.qa_evaluated_date),
      updated_at = CASE
        WHEN issue_qa_timeline.qa_tested_date IS NULL OR issue_qa_timeline.qa_evaluated_date IS NULL THEN now()
        ELSE issue_qa_timeline.updated_at
      END
    WHERE issue_qa_timeline.qa_tested_date IS NULL
       OR issue_qa_timeline.qa_evaluated_date IS NULL
  `);

  const prdResult = await client.query(`
    WITH source_dates AS (
      SELECT h.id AS issue_id, prd.prd_import_date
      FROM issue_headers h
      LEFT JOIN LATERAL (
        SELECT COALESCE(l.import_date, l.imported_at::date) AS prd_import_date
        FROM issue_cr_links link
        JOIN cr_transport_lifecycle l
          ON l.source_system_code = 'DEV'
          AND l.target_system_code = 'PRD'
          AND l.trkorr = link.trkorr
          AND l.transport_status = 'imported'
        WHERE link.issue_id = h.id
          AND COALESCE(l.import_date, l.imported_at::date) IS NOT NULL
        ORDER BY link.is_primary DESC, COALESCE(l.import_date, l.imported_at::date) DESC
        LIMIT 1
      ) prd ON true
      WHERE lower(coalesce(h.issue_status, '')) = 'open'
        AND prd.prd_import_date IS NOT NULL
    )
    INSERT INTO issue_prd_timeline (issue_id, prd_requested_date, approval_date, updated_at)
    SELECT issue_id, prd_import_date, prd_import_date, now()
    FROM source_dates
    ON CONFLICT (issue_id) DO UPDATE SET
      prd_requested_date = COALESCE(issue_prd_timeline.prd_requested_date, EXCLUDED.prd_requested_date),
      approval_date = COALESCE(issue_prd_timeline.approval_date, EXCLUDED.approval_date),
      updated_at = CASE
        WHEN issue_prd_timeline.prd_requested_date IS NULL OR issue_prd_timeline.approval_date IS NULL THEN now()
        ELSE issue_prd_timeline.updated_at
      END
    WHERE issue_prd_timeline.prd_requested_date IS NULL
       OR issue_prd_timeline.approval_date IS NULL
  `);

  if (apply) await client.query("COMMIT");
  else await client.query("ROLLBACK");

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? "applied" : "dry-run",
    preview: preview.rows[0],
    updatedRows: {
      issue_dev_timeline: devResult.rowCount,
      issue_qa_timeline: qaResult.rowCount,
      issue_prd_timeline: prdResult.rowCount
    }
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
