import { pool } from "./pool.js";
import type { CrCreationLog, CrDetailResult, CrHeader, CrObject, CrObjectKey, TransportImportLog } from "../sap/crExtractor.js";

export async function getDashboard() {
  const [{ rows: statusRows }, { rows: agingRows }, { rows: landscapeRows }, { rows: funnelRows }, { rows: activityRows }, { rows: syncRows }, { rows: healthRows }] = await Promise.all([
    pool.query("SELECT status_group, COUNT(*)::int AS count FROM cr_requests WHERE sap_system_code = 'DEV' AND parent_request IS NULL AND upper(owner) = 'TRSTDEV' GROUP BY status_group ORDER BY status_group"),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status_group = 'outstanding' AND changed_date < current_date - interval '14 days')::int AS older_than_14_days,
        COUNT(*) FILTER (WHERE status_group = 'outstanding')::int AS outstanding
      FROM cr_requests
      WHERE sap_system_code = 'DEV'
        AND parent_request IS NULL
        AND upper(owner) = 'TRSTDEV'
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE dev.status_group = 'released')::int AS dev_released,
        COUNT(*) FILTER (WHERE qa.transport_status = 'imported')::int AS imported_qa,
        COUNT(*) FILTER (WHERE dev.status_group = 'released' AND COALESCE(qa.transport_status, 'pending') <> 'imported')::int AS pending_qa,
        COUNT(*) FILTER (WHERE prd.transport_status = 'imported')::int AS imported_prd,
        COUNT(*) FILTER (
          WHERE qa.transport_status = 'imported'
            AND COALESCE(prd.transport_status, 'pending') <> 'imported'
        )::int AS pending_prd,
        COUNT(*) FILTER (
          WHERE dev.status_group = 'released'
            AND COALESCE(qa.transport_status, 'pending') <> 'imported'
            AND dev.changed_date < current_date - interval '7 days'
        )::int AS pending_qa_older_than_7_days,
        COUNT(*) FILTER (
          WHERE qa.transport_status = 'imported'
            AND COALESCE(prd.transport_status, 'pending') <> 'imported'
            AND dev.changed_date < current_date - interval '7 days'
        )::int AS pending_prd_older_than_7_days
      FROM cr_requests dev
      LEFT JOIN cr_transport_lifecycle qa
        ON qa.source_system_code = 'DEV'
        AND qa.target_system_code = 'QA'
        AND qa.trkorr = dev.trkorr
      LEFT JOIN cr_transport_lifecycle prd
        ON prd.source_system_code = 'DEV'
        AND prd.target_system_code = 'PRD'
        AND prd.trkorr = dev.trkorr
      WHERE dev.sap_system_code = 'DEV'
        AND dev.parent_request IS NULL
        AND upper(dev.owner) = 'TRSTDEV'
    `),
    pool.query(`
      WITH released AS (
        SELECT COUNT(*)::int AS value
        FROM cr_requests
        WHERE sap_system_code = 'DEV'
          AND parent_request IS NULL
          AND status_group = 'released'
          AND upper(owner) = 'TRSTDEV'
      ),
      qa AS (
        SELECT COUNT(*)::int AS value
        FROM cr_transport_lifecycle lifecycle
        JOIN cr_requests dev
          ON dev.sap_system_code = lifecycle.source_system_code
          AND dev.trkorr = lifecycle.trkorr
          AND dev.parent_request IS NULL
          AND upper(dev.owner) = 'TRSTDEV'
        WHERE lifecycle.source_system_code = 'DEV'
          AND lifecycle.target_system_code = 'QA'
          AND lifecycle.transport_status = 'imported'
      ),
      prd AS (
        SELECT COUNT(*)::int AS value
        FROM cr_transport_lifecycle lifecycle
        JOIN cr_requests dev
          ON dev.sap_system_code = lifecycle.source_system_code
          AND dev.trkorr = lifecycle.trkorr
          AND dev.parent_request IS NULL
          AND upper(dev.owner) = 'TRSTDEV'
        WHERE lifecycle.source_system_code = 'DEV'
          AND lifecycle.target_system_code = 'PRD'
          AND lifecycle.transport_status = 'imported'
      )
      SELECT 'Released DEV' AS label, value FROM released
      UNION ALL SELECT 'In QA', value FROM qa
      UNION ALL SELECT 'In PRD', value FROM prd
    `),
    pool.query(`
      SELECT sap_system_code, trkorr, description, status_group, changed_date::text AS changed_date
      FROM cr_requests
      WHERE parent_request IS NULL
        AND upper(owner) = 'TRSTDEV'
      ORDER BY changed_date DESC NULLS LAST, changed_time DESC NULLS LAST, trkorr
      LIMIT 8
    `),
    pool.query(`
      SELECT id, sap_system_code, scope_owner, period_type, period_value,
             from_date::text AS from_date, to_date::text AS to_date, max_rows,
             status, request_count, started_at, finished_at, message
      FROM sync_runs
      WHERE status = 'success'
        AND COALESCE(period_type, '') <> 'orphan_recovery'
      ORDER BY id DESC
      LIMIT 1
    `),
    pool.query(`
      SELECT DISTINCT ON (sap_system_code)
             sap_system_code, status, request_count, started_at, finished_at, message,
             sync_mode, lookback_days, from_date::text AS from_date, to_date::text AS to_date
      FROM sync_runs
      WHERE COALESCE(period_type, '') <> 'orphan_recovery'
      ORDER BY sap_system_code, id DESC
    `)
  ]);

  return {
    byStatus: statusRows,
    aging: agingRows[0],
    landscape: landscapeRows[0],
    lifecycleFunnel: funnelRows,
    recentActivity: activityRows,
    syncHealth: healthRows,
    lastSuccessfulSync: syncRows[0] || null,
    lastSuccessfulSyncAt: syncRows[0]?.finished_at || syncRows[0]?.started_at || null,
    dbFetchedAt: new Date().toISOString()
  };
}

export async function getDashboardStatusTrend({
  fromPeriod,
  toPeriod
}: {
  fromPeriod?: string;
  toPeriod?: string;
}) {
  const now = new Date();
  const normalizedFrom = /^\d{4}-\d{2}$/.test(fromPeriod || "") ? fromPeriod! : `${now.getFullYear()}-01`;
  const normalizedTo = /^\d{4}-\d{2}$/.test(toPeriod || "") ? toPeriod! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startPeriod = normalizedFrom <= normalizedTo ? normalizedFrom : normalizedTo;
  const endPeriod = normalizedFrom <= normalizedTo ? normalizedTo : normalizedFrom;
  const { rows } = await pool.query(`
    WITH months AS (
      SELECT generate_series(
        to_date($1, 'YYYY-MM'),
        to_date($2, 'YYYY-MM'),
        interval '1 month'
      )::date AS month_start
    ),
    grouped AS (
      SELECT
        date_trunc('month', changed_date)::date AS month_start,
        status_group,
        COUNT(*)::int AS count
      FROM cr_requests
      WHERE sap_system_code = 'DEV'
        AND parent_request IS NULL
        AND upper(owner) = 'TRSTDEV'
        AND changed_date >= to_date($1, 'YYYY-MM')
        AND changed_date < (to_date($2, 'YYYY-MM') + interval '1 month')
      GROUP BY date_trunc('month', changed_date)::date, status_group
    )
    SELECT
      EXTRACT(MONTH FROM months.month_start)::int AS month_number,
      to_char(months.month_start, 'Mon YYYY') AS month_label,
      months.month_start::text AS month_start,
      COALESCE(SUM(grouped.count) FILTER (WHERE grouped.status_group = 'outstanding'), 0)::int AS outstanding,
      COALESCE(SUM(grouped.count) FILTER (WHERE grouped.status_group = 'released'), 0)::int AS released
    FROM months
    LEFT JOIN grouped ON grouped.month_start = months.month_start
    GROUP BY months.month_start
    ORDER BY months.month_start
  `, [startPeriod, endPeriod]);

  return {
    fromPeriod: startPeriod,
    toPeriod: endPeriod,
    dbFetchedAt: new Date().toISOString(),
    rows
  };
}

export type CrRequestFilters = {
  sapSystemCode?: string;
  status?: string;
  lifecycleStatus?: string;
  owner?: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

export async function listCrRequests(filters: CrRequestFilters = {}) {
  const where: string[] = ["parent_request IS NULL", "upper(owner) = 'TRSTDEV'"];
  const params: unknown[] = [];
  const page = Math.max(Number(filters.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize || 10), 1), 100);
  const offset = (page - 1) * pageSize;

  if (filters.sapSystemCode && filters.sapSystemCode !== "all") {
    params.push(filters.sapSystemCode.toUpperCase());
    where.push(`sap_system_code = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`status_group = $${params.length}`);
  }
  if (filters.lifecycleStatus && filters.lifecycleStatus !== "all") {
    if (filters.lifecycleStatus === "pending_qa") {
      where.push(`sap_system_code = 'DEV' AND status_group = 'released' AND NOT EXISTS (
        SELECT 1 FROM cr_transport_lifecycle qa
        WHERE qa.source_system_code = 'DEV'
          AND qa.target_system_code = 'QA'
          AND qa.trkorr = cr_requests.trkorr
          AND qa.transport_status = 'imported'
      )`);
    }
    if (filters.lifecycleStatus === "in_qa") {
      where.push(`sap_system_code = 'DEV' AND EXISTS (
        SELECT 1 FROM cr_transport_lifecycle qa
        WHERE qa.source_system_code = 'DEV'
          AND qa.target_system_code = 'QA'
          AND qa.trkorr = cr_requests.trkorr
          AND qa.transport_status = 'imported'
      )`);
    }
    if (filters.lifecycleStatus === "pending_prd") {
      where.push(`sap_system_code = 'DEV' AND EXISTS (
        SELECT 1 FROM cr_transport_lifecycle qa
        WHERE qa.source_system_code = 'DEV'
          AND qa.target_system_code = 'QA'
          AND qa.trkorr = cr_requests.trkorr
          AND qa.transport_status = 'imported'
      ) AND NOT EXISTS (
        SELECT 1 FROM cr_transport_lifecycle prd
        WHERE prd.source_system_code = 'DEV'
          AND prd.target_system_code = 'PRD'
          AND prd.trkorr = cr_requests.trkorr
          AND prd.transport_status = 'imported'
      )`);
    }
    if (filters.lifecycleStatus === "in_prd") {
      where.push(`sap_system_code = 'DEV' AND EXISTS (
        SELECT 1 FROM cr_transport_lifecycle prd
        WHERE prd.source_system_code = 'DEV'
          AND prd.target_system_code = 'PRD'
          AND prd.trkorr = cr_requests.trkorr
          AND prd.transport_status = 'imported'
      )`);
    }
  }
  if (filters.owner) {
    params.push(filters.owner.toUpperCase());
    where.push(`owner = $${params.length}`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`changed_date >= $${params.length}::date`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`changed_date <= $${params.length}::date`);
  }
  const query = filters.q?.trim();
  if (query) {
    params.push(`%${query.toUpperCase()}%`);
    where.push(`(
      upper(cr_requests.trkorr) LIKE $${params.length}
      OR upper(coalesce(cr_requests.description, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
        FROM cr_requests child
        WHERE child.sap_system_code = cr_requests.sap_system_code
          AND child.parent_request = cr_requests.trkorr
          AND (
            upper(child.trkorr) LIKE $${params.length}
            OR upper(coalesce(child.description, '')) LIKE $${params.length}
          )
      )
      OR EXISTS (
        SELECT 1
        FROM cr_objects object
        LEFT JOIN cr_requests object_request
          ON object_request.sap_system_code = object.sap_system_code
          AND object_request.trkorr = object.trkorr
        WHERE object.sap_system_code = cr_requests.sap_system_code
          AND coalesce(object_request.parent_request, object_request.trkorr) = cr_requests.trkorr
          AND (
            upper(coalesce(object.object_name, '')) LIKE $${params.length}
            OR upper(coalesce(object.object_type, '')) LIKE $${params.length}
          )
      )
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM cr_requests ${whereSql}`, params);
  const total = Number(countResult.rows[0]?.total || 0);
  params.push(pageSize, offset);
  const { rows } = await pool.query(`
    SELECT sap_system_code, trkorr, parent_request, description, function_code, status_code, status_group,
           target_system, category, owner, changed_date, changed_time, updated_at,
           CASE
             WHEN status_group <> 'released' THEN status_group
             WHEN EXISTS (
               SELECT 1 FROM cr_transport_lifecycle prd
               WHERE prd.source_system_code = 'DEV'
                 AND prd.target_system_code = 'PRD'
                 AND prd.trkorr = cr_requests.trkorr
                 AND prd.transport_status = 'imported'
             ) THEN 'in_prd'
             WHEN EXISTS (
               SELECT 1 FROM cr_transport_lifecycle qa
               WHERE qa.source_system_code = 'DEV'
                 AND qa.target_system_code = 'QA'
                 AND qa.trkorr = cr_requests.trkorr
                 AND qa.transport_status = 'imported'
             ) THEN 'pending_prd'
             WHEN sap_system_code = 'DEV' AND status_group = 'released' THEN 'pending_qa'
             ELSE 'unknown'
           END AS lifecycle_status
    FROM cr_requests
    ${whereSql}
    ORDER BY changed_date DESC NULLS LAST, changed_time DESC NULLS LAST, trkorr
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  return {
    rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    dbFetchedAt: new Date().toISOString(),
    lastSuccessfulSyncAt: await getLastSuccessfulSyncAt(),
    syncHealth: await getSyncHealthRows()
  };
}

export async function getCrDetail(trkorr: string) {
  return getCrDetailForSystem(trkorr, "DEV");
}

export async function getCrDetailForSystem(trkorr: string, sapSystemCode: string) {
  const [request, tasks, objects, keys, lifecycle] = await Promise.all([
    pool.query("SELECT * FROM cr_requests WHERE sap_system_code = $1 AND trkorr = $2", [sapSystemCode, trkorr]),
    pool.query("SELECT * FROM cr_requests WHERE sap_system_code = $1 AND parent_request = $2 ORDER BY trkorr", [sapSystemCode, trkorr]),
    pool.query(`
      SELECT *
      FROM cr_objects
      WHERE sap_system_code = $1
        AND (trkorr = $2 OR trkorr IN (
          SELECT trkorr FROM cr_requests WHERE sap_system_code = $1 AND parent_request = $2
        ))
      ORDER BY trkorr, position
    `, [sapSystemCode, trkorr]),
    pool.query(`
      SELECT *
      FROM cr_object_keys
      WHERE sap_system_code = $1
        AND (trkorr = $2 OR trkorr IN (
          SELECT trkorr FROM cr_requests WHERE sap_system_code = $1 AND parent_request = $2
        ))
      ORDER BY trkorr, position
    `, [sapSystemCode, trkorr]),
    getCrLifecycle(trkorr)
  ]);

  return {
    request: request.rows[0] || null,
    tasks: tasks.rows,
    lifecycle,
    objects: objects.rows,
    keys: keys.rows
  };
}

async function getCrLifecycle(trkorr: string) {
  const [{ rows }, { rows: transportRows }] = await Promise.all([
    pool.query(`
    SELECT sap_system_code, status_group, changed_date::text AS changed_date,
           sap_created_at, sap_released_at
    FROM cr_requests
    WHERE trkorr = $1
      AND parent_request IS NULL
      AND sap_system_code IN ('DEV', 'QA', 'PRD')
  `, [trkorr]),
    pool.query(`
      SELECT target_system_code, transport_status, evidence_source,
             import_date::text AS import_date, import_time::text AS import_time,
             imported_at, return_code
      FROM cr_transport_lifecycle
      WHERE source_system_code = 'DEV'
        AND trkorr = $1
        AND target_system_code IN ('QA', 'PRD')
    `, [trkorr])
  ]);
  const bySystem = Object.fromEntries(rows.map((row) => [row.sap_system_code, row]));
  const byTarget = Object.fromEntries(transportRows.map((row) => [row.target_system_code, row]));
  const dev = bySystem.DEV;
  const qa = byTarget.QA;
  const prd = byTarget.PRD;
  return {
    created_at: dev?.sap_created_at || dev?.changed_date || undefined,
    released_at: dev?.sap_released_at || (dev?.status_group === "released" ? dev.changed_date : undefined),
    qa_imported_at: qa?.imported_at || qa?.import_date || undefined,
    prd_imported_at: prd?.imported_at || prd?.import_date || undefined,
    qa_status: qa?.transport_status || (dev ? "pending" : "unknown"),
    prd_status: prd?.transport_status || (dev ? "pending" : "unknown"),
    qa_evidence_source: qa?.evidence_source || "unknown",
    prd_evidence_source: prd?.evidence_source || "unknown",
    qa_return_code: qa?.return_code || undefined,
    prd_return_code: prd?.return_code || undefined
  };
}

export async function refreshTransportLifecycleFromCache(sourceSystemCode = "DEV") {
  for (const targetSystemCode of ["QA", "PRD"]) {
    await pool.query(`
      INSERT INTO cr_transport_lifecycle (
        source_system_code, trkorr, target_system_code, transport_status, evidence_source,
        import_date, import_time, message, last_checked_at, updated_at
      )
      SELECT
        $1,
        dev.trkorr,
        $2,
        CASE WHEN target.trkorr IS NULL THEN 'pending' ELSE 'imported' END,
        CASE WHEN target.trkorr IS NULL THEN 'unknown' ELSE 'inferred' END,
        CASE WHEN target.trkorr IS NULL THEN NULL ELSE target.changed_date END,
        CASE WHEN target.trkorr IS NULL THEN NULL ELSE target.changed_time END,
        CASE WHEN target.trkorr IS NULL THEN 'No matching parent CR found in target cache.' ELSE 'Inferred from matching parent CR in target cache.' END,
        now(),
        now()
      FROM cr_requests dev
      LEFT JOIN cr_requests target
        ON target.sap_system_code = $2
        AND target.parent_request IS NULL
        AND target.trkorr = dev.trkorr
      WHERE dev.sap_system_code = $1
        AND dev.parent_request IS NULL
        AND dev.status_group = 'released'
        AND upper(dev.owner) = 'TRSTDEV'
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
    `, [sourceSystemCode, targetSystemCode]);
  }
}

export async function upsertConfirmedTransportLogs(targetSystemCode: string, logs: TransportImportLog[]) {
  const orphanLogs: TransportImportLog[] = [];
  let processed = 0;
  for (const log of dedupeLatestTransportLogs(logs)) {
    const parsed = parseSapTimestamp(log.timestamp);
    const status = transportStatusFromReturnCode(log.returnCode);
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
        AND upper(dev.owner) = 'TRSTDEV'
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
      log.trkorr,
      targetSystemCode,
      status,
      parsed.iso,
      parsed.date,
      parsed.time,
      log.returnCode || null,
      `Confirmed from TPALOG${log.step ? ` step ${log.step}` : ""}${log.host ? ` on ${log.host}` : ""}.`
    ]);
    if ((result.rowCount || 0) === 0) {
      orphanLogs.push(log);
      await upsertOrphanTransportImport(targetSystemCode, log, status, parsed);
    } else {
      processed += result.rowCount || 0;
      await markOrphanTransportRecovered(targetSystemCode, log.trkorr, "Lifecycle imported after DEV parent was available.");
    }
  }
  return { processed, orphanLogs };
}

export async function hasDevParentCr(trkorr: string) {
  const { rows } = await pool.query(`
    SELECT 1
    FROM cr_requests
    WHERE sap_system_code = 'DEV'
      AND trkorr = $1
      AND parent_request IS NULL
    LIMIT 1
  `, [trkorr]);
  return Boolean(rows[0]);
}

export async function markOrphanTransportRecoveryFailed(targetSystemCode: string, trkorr: string, message: string) {
  await pool.query(`
    UPDATE cr_orphan_transport_imports
    SET recovery_status = 'failed',
        recovery_message = $3,
        last_seen_at = now()
    WHERE source_system_code = 'DEV'
      AND target_system_code = $1
      AND trkorr = $2
  `, [targetSystemCode, trkorr, message]);
}

export async function markOrphanTransportRecovered(targetSystemCode: string, trkorr: string, message: string) {
  await pool.query(`
    UPDATE cr_orphan_transport_imports
    SET recovery_status = 'recovered',
        recovery_message = $3,
        recovered_at = now(),
        last_seen_at = now()
    WHERE source_system_code = 'DEV'
      AND target_system_code = $1
      AND trkorr = $2
  `, [targetSystemCode, trkorr, message]);
}

async function upsertOrphanTransportImport(
  targetSystemCode: string,
  log: TransportImportLog,
  status: string,
  parsed: ReturnType<typeof parseSapTimestamp>
) {
  await pool.query(`
    INSERT INTO cr_orphan_transport_imports (
      source_system_code, trkorr, target_system_code, transport_status,
      imported_at, import_date, import_time, return_code, message,
      recovery_status, recovery_message, first_seen_at, last_seen_at
    )
    VALUES (
      'DEV', $1, $2, $3, $4::timestamptz, $5::date, $6::time, $7, $8,
      'pending', 'DEV parent CR is not cached yet.', now(), now()
    )
    ON CONFLICT (source_system_code, trkorr, target_system_code) DO UPDATE SET
      transport_status = EXCLUDED.transport_status,
      imported_at = EXCLUDED.imported_at,
      import_date = EXCLUDED.import_date,
      import_time = EXCLUDED.import_time,
      return_code = EXCLUDED.return_code,
      message = EXCLUDED.message,
      recovery_status = CASE
        WHEN cr_orphan_transport_imports.recovery_status = 'recovered' THEN cr_orphan_transport_imports.recovery_status
        ELSE 'pending'
      END,
      recovery_message = CASE
        WHEN cr_orphan_transport_imports.recovery_status = 'recovered' THEN cr_orphan_transport_imports.recovery_message
        ELSE 'DEV parent CR is not cached yet.'
      END,
      last_seen_at = now()
  `, [
    log.trkorr,
    targetSystemCode,
    status,
    parsed.iso,
    parsed.date,
    parsed.time,
    log.returnCode || null,
    `Confirmed from TPALOG${log.step ? ` step ${log.step}` : ""}${log.host ? ` on ${log.host}` : ""}.`
  ]);
}

export async function getLastSuccessfulSyncAt() {
  const { rows } = await pool.query(`
    SELECT COALESCE(finished_at, started_at) AS last_successful_sync_at
    FROM sync_runs
    WHERE status = 'success'
      AND COALESCE(period_type, '') <> 'orphan_recovery'
    ORDER BY id DESC
    LIMIT 1
  `);
  return rows[0]?.last_successful_sync_at || null;
}

export async function getSyncHealthRows() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (sap_system_code)
           sap_system_code, status, request_count, started_at, finished_at, message,
           sync_mode, lookback_days, from_date::text AS from_date, to_date::text AS to_date
    FROM sync_runs
    WHERE COALESCE(period_type, '') <> 'orphan_recovery'
    ORDER BY sap_system_code, id DESC
  `);
  return rows;
}

export async function createSyncRun({
  scopeOwner,
  sapSystemCode,
  periodType,
  periodValue,
  fromDate,
  toDate,
  maxRows,
  syncMode = "full_period",
  lookbackDays = null
}: {
  scopeOwner: string;
  sapSystemCode: string;
  periodType: string;
  periodValue: number | null;
  fromDate: string;
  toDate: string;
  maxRows: number;
  syncMode?: string;
  lookbackDays?: number | null;
}) {
  const { rows } = await pool.query(
    `
      INSERT INTO sync_runs (sap_system_code, scope_owner, period_type, period_value, from_date, to_date, max_rows, sync_mode, lookback_days)
      VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
      RETURNING id
    `,
    [sapSystemCode, scopeOwner, periodType, periodValue, fromDate, toDate, maxRows, syncMode, lookbackDays]
  );
  return Number(rows[0].id);
}

export async function getLastSuccessfulSyncRun(sapSystemCode: string) {
  const { rows } = await pool.query(`
    SELECT id, sap_system_code, from_date::text AS from_date, to_date::text AS to_date, started_at, finished_at
    FROM sync_runs
    WHERE sap_system_code = $1
      AND status = 'success'
      AND COALESCE(period_type, '') <> 'orphan_recovery'
    ORDER BY finished_at DESC NULLS LAST, id DESC
    LIMIT 1
  `, [sapSystemCode]);
  return rows[0] || null;
}

export async function getCachedCrRefreshSignature(sapSystemCode: string, trkorr: string) {
  const { rows } = await pool.query(`
    SELECT
      status_code,
      status_group,
      to_char(changed_date, 'YYYYMMDD') AS changed_date,
      to_char(changed_time, 'HH24MISS') AS changed_time,
      (
        SELECT COUNT(*)::int
        FROM cr_requests child
        WHERE child.sap_system_code = cr_requests.sap_system_code
          AND child.parent_request = cr_requests.trkorr
      ) AS task_count,
      (
        SELECT COUNT(*)::int
        FROM cr_objects object
        WHERE object.sap_system_code = cr_requests.sap_system_code
          AND (
            object.trkorr = cr_requests.trkorr
            OR object.trkorr IN (
              SELECT child.trkorr
              FROM cr_requests child
              WHERE child.sap_system_code = cr_requests.sap_system_code
                AND child.parent_request = cr_requests.trkorr
            )
          )
      ) AS object_count
    FROM cr_requests
    WHERE sap_system_code = $1
      AND trkorr = $2
    LIMIT 1
  `, [sapSystemCode, trkorr]);
  return rows[0] || null;
}

export async function finishSyncRun(id: number, status: string, message: string | null, requestCount: number) {
  await pool.query(
    "UPDATE sync_runs SET status = $2, message = $3, request_count = $4, finished_at = now() WHERE id = $1",
    [id, status, message, requestCount]
  );
}

export async function upsertCrHeader(header: CrHeader, sapSystemCode: string, syncRunId: number) {
  await pool.query(
    `
      INSERT INTO cr_requests (
        sap_system_code, trkorr, parent_request, description, function_code, status_code,
        status_group, target_system, category, owner, changed_date, changed_time, last_sync_run_id,
        sap_released_at, sap_released_source, first_seen_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        to_date(NULLIF($11, ''), 'YYYYMMDD'),
        to_timestamp(NULLIF($12, ''), 'HH24MISS')::time,
        $13,
        CASE WHEN $7 = 'released' AND NULLIF($11, '') IS NOT NULL THEN (to_date(NULLIF($11, ''), 'YYYYMMDD')::text || ' ' || COALESCE(to_timestamp(NULLIF($12, ''), 'HH24MISS')::time::text, '00:00:00') || '+07')::timestamptz ELSE NULL END,
        CASE WHEN $7 = 'released' AND NULLIF($11, '') IS NOT NULL THEN 'sap_e070_released' ELSE NULL END,
        now()
      )
      ON CONFLICT (sap_system_code, trkorr) DO UPDATE SET
        parent_request = EXCLUDED.parent_request,
        description = EXCLUDED.description,
        function_code = EXCLUDED.function_code,
        status_code = EXCLUDED.status_code,
        status_group = EXCLUDED.status_group,
        target_system = EXCLUDED.target_system,
        category = EXCLUDED.category,
        owner = EXCLUDED.owner,
        changed_date = EXCLUDED.changed_date,
        changed_time = EXCLUDED.changed_time,
        sap_released_at = CASE
          WHEN EXCLUDED.sap_released_at IS NULL THEN cr_requests.sap_released_at
          WHEN cr_requests.sap_released_at IS NULL
            OR cr_requests.sap_released_source IS DISTINCT FROM 'sap_e070_released'
            OR cr_requests.sap_released_at IS DISTINCT FROM EXCLUDED.sap_released_at
            THEN EXCLUDED.sap_released_at
          ELSE cr_requests.sap_released_at
        END,
        sap_released_source = CASE
          WHEN EXCLUDED.sap_released_at IS NULL THEN cr_requests.sap_released_source
          WHEN cr_requests.sap_released_at IS NULL
            OR cr_requests.sap_released_source IS DISTINCT FROM 'sap_e070_released'
            OR cr_requests.sap_released_at IS DISTINCT FROM EXCLUDED.sap_released_at
            THEN EXCLUDED.sap_released_source
          ELSE cr_requests.sap_released_source
        END,
        first_seen_at = COALESCE(cr_requests.first_seen_at, EXCLUDED.first_seen_at),
        last_sync_run_id = EXCLUDED.last_sync_run_id,
        updated_at = now()
    `,
    [
      sapSystemCode,
      header.trkorr,
      header.parentRequest || null,
      header.description || null,
      header.function || null,
      header.status || null,
      header.statusGroup,
      header.targetSystem || null,
      header.category || null,
      header.owner || null,
      header.changedDate || "",
      header.changedTime || "",
      syncRunId
    ]
  );
}

export async function upsertCrCreationLogs(sapSystemCode: string, rows: CrCreationLog[]) {
  let updated = 0;
  for (const row of rows) {
    const result = await pool.query(`
      UPDATE cr_requests
      SET sap_created_at = (to_date(NULLIF($2, ''), 'YYYYMMDD')::text || ' ' || COALESCE(to_timestamp(NULLIF($3, ''), 'HH24MISS')::time::text, '08:00:00') || '+07')::timestamptz,
          sap_created_source = 'sap_e070create',
          first_seen_at = COALESCE(first_seen_at, updated_at),
          updated_at = now()
      WHERE sap_system_code = $1
        AND trkorr = $4
        AND parent_request IS NULL
        AND (
          sap_created_at IS NULL
          OR sap_created_source IS DISTINCT FROM 'sap_e070create'
          OR sap_created_at IS DISTINCT FROM (to_date(NULLIF($2, ''), 'YYYYMMDD')::text || ' ' || COALESCE(to_timestamp(NULLIF($3, ''), 'HH24MISS')::time::text, '08:00:00') || '+07')::timestamptz
        )
        AND NULLIF($2, '') IS NOT NULL
    `, [sapSystemCode, row.createdDate || "", row.createdTime || "", row.trkorr]);
    updated += result.rowCount || 0;
  }
  return updated;
}

export async function insertCrStatusSnapshot(header: CrHeader, sapSystemCode: string, syncRunId: number) {
  await pool.query(
    `
      INSERT INTO cr_status_snapshots (
        sap_system_code, trkorr, sync_run_id, parent_request, description, function_code,
        status_code, status_group, target_system, category, owner, sap_changed_date, sap_changed_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_date(NULLIF($12, ''), 'YYYYMMDD'), to_timestamp(NULLIF($13, ''), 'HH24MISS')::time)
      ON CONFLICT (sap_system_code, trkorr, sync_run_id) DO UPDATE SET
        parent_request = EXCLUDED.parent_request,
        description = EXCLUDED.description,
        function_code = EXCLUDED.function_code,
        status_code = EXCLUDED.status_code,
        status_group = EXCLUDED.status_group,
        target_system = EXCLUDED.target_system,
        category = EXCLUDED.category,
        owner = EXCLUDED.owner,
        sap_changed_date = EXCLUDED.sap_changed_date,
        sap_changed_time = EXCLUDED.sap_changed_time,
        captured_at = now()
    `,
    [
      sapSystemCode,
      header.trkorr,
      syncRunId,
      header.parentRequest || null,
      header.description || null,
      header.function || null,
      header.status || null,
      header.statusGroup,
      header.targetSystem || null,
      header.category || null,
      header.owner || null,
      header.changedDate || "",
      header.changedTime || ""
    ]
  );
}

export async function replaceCrObjects(detail: CrDetailResult, sapSystemCode: string) {
  const trkorrs = [detail.trkorr, ...detail.tasks.map((task) => task.trkorr)];
  await pool.query("DELETE FROM cr_objects WHERE sap_system_code = $1 AND trkorr = ANY($2)", [sapSystemCode, trkorrs]);
  await pool.query("DELETE FROM cr_object_keys WHERE sap_system_code = $1 AND trkorr = ANY($2)", [sapSystemCode, trkorrs]);

  for (const group of detail.objectGroups) {
    for (const object of group.objects) {
      await insertObject(object, sapSystemCode);
    }
    for (const key of group.keys) {
      await insertObjectKey(key, sapSystemCode);
    }
  }
}

async function insertObject(object: CrObject, sapSystemCode: string) {
  await pool.query(
    `
      INSERT INTO cr_objects (sap_system_code, trkorr, position, pgmid, object_type, object_name, diff_readiness)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (sap_system_code, trkorr, position) DO UPDATE SET
        pgmid = EXCLUDED.pgmid,
        object_type = EXCLUDED.object_type,
        object_name = EXCLUDED.object_name,
        diff_readiness = EXCLUDED.diff_readiness,
        updated_at = now()
    `,
    [sapSystemCode, object.trkorr, object.position, object.pgmid || null, object.objectType || null, object.objectName || null, object.diffReadiness || null]
  );
}

async function insertObjectKey(key: CrObjectKey, sapSystemCode: string) {
  await pool.query(
    `
      INSERT INTO cr_object_keys (sap_system_code, trkorr, position, pgmid, object_type, object_name, table_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [sapSystemCode, key.trkorr, key.position, key.pgmid || null, key.objectType || null, key.objectName || null, key.tableKey || null]
  );
}

function dedupeLatestTransportLogs(logs: TransportImportLog[]) {
  const byRequest = new Map<string, TransportImportLog>();
  for (const log of logs.filter((item) => isTransportRequestId(item.trkorr))) {
    const current = byRequest.get(log.trkorr);
    if (!current || String(log.timestamp || "") >= String(current.timestamp || "")) {
      byRequest.set(log.trkorr, log);
    }
  }
  return [...byRequest.values()];
}

function isTransportRequestId(value?: string) {
  return /^[A-Z0-9]{3}K\d{6}$/i.test(String(value || "").trim());
}

function parseSapTimestamp(value?: string) {
  const timestamp = String(value || "").padEnd(14, "0");
  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(4, 6);
  const day = timestamp.slice(6, 8);
  const hour = timestamp.slice(8, 10);
  const minute = timestamp.slice(10, 12);
  const second = timestamp.slice(12, 14);
  if (!/^\d{14}$/.test(timestamp)) {
    return { iso: null, date: null, time: null };
  }
  return {
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`,
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`
  };
}

function transportStatusFromReturnCode(returnCode?: string) {
  const parsed = Number(returnCode);
  if (!Number.isFinite(parsed)) return "imported";
  if (parsed <= 4) return "imported";
  return "failed";
}
