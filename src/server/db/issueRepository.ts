import { pool } from "./pool.js";

export type IssueFilters = {
  status?: string;
  q?: string;
  requester?: string;
  abaper?: string;
  crHelpdesk?: string;
  cr?: string;
  glpi?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

export type IssueSavePayload = {
  id?: number;
  createMode?: "new" | "sub";
  issueNo?: number | string;
  subIssueNo?: string;
  issueName: string;
  requesterNames?: string;
  abaperNames?: string;
  problemAnalysis?: string;
  impactAnalysis?: string;
  emailSubject?: string;
  createIssueDate?: string;
  sourceIssueStatus?: string;
  cancelledDate?: string;
  cancelledReason?: string;
  crHelpdeskNumbers?: string;
  glpiTickets?: string;
  crLinks?: string;
  participants?: Record<string, string | undefined>;
  timeline?: Record<string, string | undefined>;
};

export async function listIssues(filters: IssueFilters = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const page = Math.max(Number(filters.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize || 25), 1), 100);
  const offset = (page - 1) * pageSize;

  const statusFilter = filters.status && filters.status !== "all" ? filters.status : "";
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`h.create_issue_date >= $${params.length}::date`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`h.create_issue_date <= $${params.length}::date`);
  }
  if (filters.requester) {
    params.push(`%${filters.requester.toUpperCase()}%`);
    where.push(`upper(coalesce(h.requester_name_snapshot, '')) LIKE $${params.length}`);
  }
  if (filters.abaper) {
    params.push(`%${filters.abaper.toUpperCase()}%`);
    where.push(`upper(coalesce(h.abaper_name_snapshot, '')) LIKE $${params.length}`);
  }
  if (filters.cr) {
    params.push(`%${filters.cr.toUpperCase()}%`);
    where.push(`EXISTS (
      SELECT 1 FROM issue_cr_links cr
      WHERE cr.issue_id = h.id
        AND upper(cr.trkorr) LIKE $${params.length}
    )`);
  }
  if (filters.glpi) {
    const ticket = Number(String(filters.glpi).replace(/[^\d]/g, ""));
    if (Number.isFinite(ticket) && ticket > 0) {
      params.push(ticket);
      where.push(`EXISTS (
        SELECT 1 FROM issue_glpi_tickets glpi
        WHERE glpi.issue_id = h.id
          AND glpi.ticket_number = $${params.length}
      )`);
    }
  }
  if (filters.crHelpdesk) {
    params.push(`%${filters.crHelpdesk.trim().toUpperCase()}%`);
    where.push(`EXISTS (
      SELECT 1 FROM issue_cr_helpdesk_numbers helpdesk
      WHERE helpdesk.issue_id = h.id
        AND upper(helpdesk.cr_helpdesk_no) LIKE $${params.length}
    )`);
  }
  const query = filters.q?.trim();
  if (query) {
    params.push(`%${query.toUpperCase()}%`);
    where.push(`(
      upper(h.issue_name) LIKE $${params.length}
      OR upper(h.issue_no::text || '-' || h.sub_issue_no) LIKE $${params.length}
      OR upper(coalesce(h.requester_name_snapshot, '')) LIKE $${params.length}
      OR upper(coalesce(h.abaper_name_snapshot, '')) LIKE $${params.length}
      OR upper(coalesce(h.problem_analysis, '')) LIKE $${params.length}
      OR upper(coalesce(h.impact_analysis, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1 FROM issue_cr_links cr
        WHERE cr.issue_id = h.id
          AND upper(cr.trkorr) LIKE $${params.length}
      )
      OR EXISTS (
        SELECT 1 FROM issue_glpi_tickets glpi
        WHERE glpi.issue_id = h.id
          AND glpi.ticket_number::text LIKE $${params.length}
      )
      OR EXISTS (
        SELECT 1 FROM issue_cr_helpdesk_numbers helpdesk
        WHERE helpdesk.issue_id = h.id
          AND upper(helpdesk.cr_helpdesk_no) LIKE $${params.length}
      )
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseSelectSql = `
    SELECT
      h.id,
      h.issue_no,
      h.sub_issue_no,
      h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
      h.issue_name,
      h.requester_name_snapshot,
      h.abaper_name_snapshot,
      h.create_issue_date::text AS create_issue_date,
      CASE
        WHEN lower(coalesce(h.issue_status, '')) = 'cancelled' THEN 'cancelled'
        WHEN primary_cr.trkorr IS NULL THEN 'open'
        WHEN primary_cr.lifecycle_status = 'in_prd' THEN 'ok'
        ELSE 'in_progress'
      END AS issue_status,
      h.issue_status AS source_issue_status,
      h.cancelled_reason,
      primary_glpi.ticket_number AS primary_glpi_ticket,
      primary_helpdesk.cr_helpdesk_no AS primary_cr_helpdesk_no,
      primary_cr.trkorr AS primary_cr,
      primary_cr.cr_description_snapshot AS primary_cr_description,
      CASE
        WHEN lower(coalesce(h.issue_status, '')) = 'cancelled' THEN 'cancelled'
        ELSE primary_cr.lifecycle_status
      END AS primary_cr_status,
      (
        CASE WHEN nullif(trim(coalesce(h.issue_name, '')), '') IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(trim(coalesce(h.requester_name_snapshot, '')), '') IS NULL THEN 1 ELSE 0 END +
        CASE WHEN nullif(trim(coalesce(h.abaper_name_snapshot, '')), '') IS NULL THEN 1 ELSE 0 END +
        CASE WHEN h.create_issue_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN primary_glpi.ticket_number IS NULL THEN 1 ELSE 0 END +
        CASE WHEN primary_cr.trkorr IS NULL THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'requester') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'abaper') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'dev_tester') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'dev_evaluator') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'qa_transporter') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'qa_tester') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'qa_evaluator') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'prd_requester') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'prd_evaluator') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'approval') THEN 1 ELSE 0 END +
        CASE WHEN NOT EXISTS (SELECT 1 FROM issue_participants p WHERE p.issue_id = h.id AND p.role = 'executor') THEN 1 ELSE 0 END +
        CASE WHEN dev.dev_tested_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN dev.dev_evaluated_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN qa.qa_tested_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN qa.qa_evaluated_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN prd.prd_requested_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN prd.prd_evaluated_date IS NULL THEN 1 ELSE 0 END +
        CASE WHEN prd.approval_date IS NULL THEN 1 ELSE 0 END
      )::int AS missing_data_count
    FROM issue_headers h
    LEFT JOIN LATERAL (
      SELECT ticket_number
      FROM issue_glpi_tickets
      WHERE issue_id = h.id
      ORDER BY is_primary DESC, ticket_number
      LIMIT 1
    ) primary_glpi ON true
    LEFT JOIN LATERAL (
      SELECT cr_helpdesk_no
      FROM issue_cr_helpdesk_numbers
      WHERE issue_id = h.id
      ORDER BY is_primary DESC, cr_helpdesk_no
      LIMIT 1
    ) primary_helpdesk ON true
    LEFT JOIN LATERAL (
      SELECT
        link.trkorr,
        link.cr_description_snapshot,
        cr.lifecycle_status
      FROM issue_cr_links link
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN lifecycle_req.status_group <> 'released' THEN lifecycle_req.status_group
            WHEN EXISTS (
              SELECT 1 FROM cr_transport_lifecycle prd_life
              WHERE prd_life.source_system_code = 'DEV'
                AND prd_life.target_system_code = 'PRD'
                AND prd_life.trkorr = lifecycle_req.trkorr
                AND prd_life.transport_status = 'imported'
            ) THEN 'in_prd'
            WHEN EXISTS (
              SELECT 1 FROM cr_transport_lifecycle qa_life
              WHERE qa_life.source_system_code = 'DEV'
                AND qa_life.target_system_code = 'QA'
                AND qa_life.trkorr = lifecycle_req.trkorr
                AND qa_life.transport_status = 'imported'
            ) THEN 'pending_prd'
            WHEN lifecycle_req.sap_system_code = 'DEV' AND lifecycle_req.status_group = 'released' THEN 'pending_qa'
            ELSE 'unknown'
          END AS lifecycle_status
        FROM cr_requests req
        LEFT JOIN cr_requests parent_req
          ON parent_req.sap_system_code = req.sap_system_code
         AND parent_req.trkorr = req.parent_request
        CROSS JOIN LATERAL (
          SELECT COALESCE(parent_req.sap_system_code, req.sap_system_code) AS sap_system_code,
                 COALESCE(parent_req.trkorr, req.trkorr) AS trkorr,
                 COALESCE(parent_req.status_group, req.status_group) AS status_group
        ) lifecycle_req
        WHERE req.sap_system_code = link.sap_system_code
          AND req.trkorr = link.trkorr
        LIMIT 1
      ) cr ON true
      WHERE link.issue_id = h.id
      ORDER BY link.is_primary DESC, link.trkorr
      LIMIT 1
    ) primary_cr ON true
    LEFT JOIN issue_dev_timeline dev ON dev.issue_id = h.id
    LEFT JOIN issue_qa_timeline qa ON qa.issue_id = h.id
    LEFT JOIN issue_prd_timeline prd ON prd.issue_id = h.id
    ${whereSql}
  `;
  const filteredParams = [...params];
  const statusWhereSql = statusFilter ? `WHERE issue_status = $${filteredParams.push(statusFilter)}` : "";
  const countResult = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM (${baseSelectSql}) issue_rows
    ${statusWhereSql}
  `, filteredParams);
  const total = Number(countResult.rows[0]?.total || 0);
  filteredParams.push(pageSize, offset);

  const { rows } = await pool.query(`
    SELECT *
    FROM (${baseSelectSql}) issue_rows
    ${statusWhereSql}
    ORDER BY issue_no DESC, sub_issue_no DESC
    LIMIT $${filteredParams.length - 1} OFFSET $${filteredParams.length}
  `, filteredParams);

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

async function getLastSuccessfulSyncAt() {
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

async function getSyncHealthRows() {
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

export async function getIssueDetail(id: number) {
  const [
    issue,
    glpi,
    crHelpdesk,
    crLinks,
    devTimeline,
    qaTimeline,
    prdTimeline,
    participants,
    statusHistory
  ] = await Promise.all([
    pool.query(`
      SELECT
        id,
        issue_no,
        sub_issue_no,
        issue_no::text || '-' || sub_issue_no AS issue_key,
        issue_name,
        requester_name_snapshot,
        problem_analysis,
        impact_analysis,
        abaper_name_snapshot,
        email_subject,
        email_date_received::text AS email_date_received,
        create_issue_date::text AS create_issue_date,
        issue_status,
        cancelled_date::text AS cancelled_date,
        cancelled_reason,
        cancelled_by_name_snapshot,
        created_at,
        updated_at
      FROM issue_headers
      WHERE id = $1
    `, [id]),
    pool.query(`
      SELECT id, ticket_number, is_primary
      FROM issue_glpi_tickets
      WHERE issue_id = $1
      ORDER BY is_primary DESC, ticket_number
    `, [id]),
    pool.query(`
      SELECT id, cr_helpdesk_no, is_primary
      FROM issue_cr_helpdesk_numbers
      WHERE issue_id = $1
      ORDER BY is_primary DESC, cr_helpdesk_no
    `, [id]),
    pool.query(`
      SELECT
        l.id,
        l.sap_system_code,
        l.trkorr,
        l.relation_type,
        l.is_primary,
        l.cr_description_snapshot,
        cr.status_group,
        cr.lifecycle_status,
        cr.changed_date::text AS changed_date,
        cr.changed_time::text AS changed_time,
        cr.sap_created_at,
        cr.sap_created_source,
        cr.sap_released_at,
        cr.sap_released_source,
        cr.qa_import_date::text AS qa_import_date,
        cr.qa_import_time::text AS qa_import_time,
        cr.prd_import_date::text AS prd_import_date,
        cr.prd_import_time::text AS prd_import_time
      FROM issue_cr_links l
      LEFT JOIN LATERAL (
        SELECT
          lifecycle_req.status_group,
          lifecycle_req.changed_date,
          lifecycle_req.changed_time,
          lifecycle_req.sap_created_at,
          lifecycle_req.sap_created_source,
          lifecycle_req.sap_released_at,
          lifecycle_req.sap_released_source,
          qa_life.import_date AS qa_import_date,
          qa_life.import_time AS qa_import_time,
          prd_life.import_date AS prd_import_date,
          prd_life.import_time AS prd_import_time,
          CASE
            WHEN lifecycle_req.status_group <> 'released' THEN lifecycle_req.status_group
            WHEN prd_life.trkorr IS NOT NULL THEN 'in_prd'
            WHEN qa_life.trkorr IS NOT NULL THEN 'pending_prd'
            WHEN lifecycle_req.sap_system_code = 'DEV' AND lifecycle_req.status_group = 'released' THEN 'pending_qa'
            ELSE 'unknown'
          END AS lifecycle_status
        FROM cr_requests req
        LEFT JOIN cr_requests parent_req
          ON parent_req.sap_system_code = req.sap_system_code
         AND parent_req.trkorr = req.parent_request
        CROSS JOIN LATERAL (
          SELECT COALESCE(parent_req.sap_system_code, req.sap_system_code) AS sap_system_code,
                 COALESCE(parent_req.trkorr, req.trkorr) AS trkorr,
                 COALESCE(parent_req.status_group, req.status_group) AS status_group,
                 COALESCE(parent_req.changed_date, req.changed_date) AS changed_date,
                 COALESCE(parent_req.changed_time, req.changed_time) AS changed_time,
                 COALESCE(parent_req.sap_created_at, req.sap_created_at) AS sap_created_at,
                 COALESCE(parent_req.sap_created_source, req.sap_created_source) AS sap_created_source,
                 COALESCE(parent_req.sap_released_at, req.sap_released_at) AS sap_released_at,
                 COALESCE(parent_req.sap_released_source, req.sap_released_source) AS sap_released_source
        ) lifecycle_req
        LEFT JOIN LATERAL (
          SELECT
            trkorr,
            COALESCE(import_date, imported_at::date) AS import_date,
            COALESCE(import_time, imported_at::time) AS import_time
          FROM cr_transport_lifecycle
          WHERE source_system_code = 'DEV'
            AND target_system_code = 'QA'
            AND trkorr = lifecycle_req.trkorr
            AND transport_status = 'imported'
          ORDER BY COALESCE(import_date, imported_at::date) DESC
          LIMIT 1
        ) qa_life ON true
        LEFT JOIN LATERAL (
          SELECT
            trkorr,
            COALESCE(import_date, imported_at::date) AS import_date,
            COALESCE(import_time, imported_at::time) AS import_time
          FROM cr_transport_lifecycle
          WHERE source_system_code = 'DEV'
            AND target_system_code = 'PRD'
            AND trkorr = lifecycle_req.trkorr
            AND transport_status = 'imported'
          ORDER BY COALESCE(import_date, imported_at::date) DESC
          LIMIT 1
        ) prd_life ON true
        WHERE req.sap_system_code = l.sap_system_code
          AND req.trkorr = l.trkorr
        LIMIT 1
      ) cr ON true
      WHERE l.issue_id = $1
      ORDER BY l.is_primary DESC, l.trkorr
    `, [id]),
    pool.query("SELECT *, dev_tested_date::text AS dev_tested_date, dev_evaluated_date::text AS dev_evaluated_date FROM issue_dev_timeline WHERE issue_id = $1", [id]),
    pool.query("SELECT *, qa_tested_date::text AS qa_tested_date, qa_evaluated_date::text AS qa_evaluated_date FROM issue_qa_timeline WHERE issue_id = $1", [id]),
    pool.query("SELECT *, prd_requested_date::text AS prd_requested_date, prd_evaluated_date::text AS prd_evaluated_date, approval_date::text AS approval_date FROM issue_prd_timeline WHERE issue_id = $1", [id]),
    pool.query(`
      SELECT
        p.id,
        p.role,
        p.source_field,
        p.person_name_snapshot,
        p.is_primary,
        people.full_name,
        people.nickname,
        people.department
      FROM issue_participants p
      LEFT JOIN issue_people people ON people.id = p.person_id
      WHERE p.issue_id = $1
      ORDER BY p.role, p.is_primary DESC, p.person_name_snapshot
    `, [id]),
    pool.query(`
      SELECT id, from_status, to_status, reason, changed_by_name_snapshot, changed_at
      FROM issue_status_history
      WHERE issue_id = $1
      ORDER BY changed_at DESC, id DESC
    `, [id])
  ]);

  const issueRow = issue.rows[0] || null;
  if (issueRow) {
    issueRow.source_issue_status = issueRow.issue_status;
    issueRow.issue_status = deriveIssueProcessStatus(issueRow.issue_status, crLinks.rows);
  }

  return {
    issue: issueRow,
    glpi: glpi.rows,
    crHelpdeskNumbers: crHelpdesk.rows,
    crLinks: crLinks.rows,
    devTimeline: devTimeline.rows[0] || null,
    qaTimeline: qaTimeline.rows[0] || null,
    prdTimeline: prdTimeline.rows[0] || null,
    participants: participants.rows,
    statusHistory: statusHistory.rows
  };
}

export async function getIssueStatusOptions() {
  const { rows } = await pool.query(`
    WITH issue_rows AS (
      SELECT
        CASE
          WHEN lower(coalesce(h.issue_status, '')) = 'cancelled' THEN 'cancelled'
          WHEN primary_cr.trkorr IS NULL THEN 'open'
          WHEN primary_cr.lifecycle_status = 'in_prd' THEN 'ok'
          ELSE 'in_progress'
        END AS issue_status
      FROM issue_headers h
      LEFT JOIN LATERAL (
        SELECT
          link.trkorr,
          cr.lifecycle_status
        FROM issue_cr_links link
        LEFT JOIN LATERAL (
          SELECT
            CASE
              WHEN lifecycle_req.status_group <> 'released' THEN lifecycle_req.status_group
              WHEN EXISTS (
                SELECT 1 FROM cr_transport_lifecycle prd_life
                WHERE prd_life.source_system_code = 'DEV'
                  AND prd_life.target_system_code = 'PRD'
                  AND prd_life.trkorr = lifecycle_req.trkorr
                  AND prd_life.transport_status = 'imported'
              ) THEN 'in_prd'
              WHEN EXISTS (
                SELECT 1 FROM cr_transport_lifecycle qa_life
                WHERE qa_life.source_system_code = 'DEV'
                  AND qa_life.target_system_code = 'QA'
                  AND qa_life.trkorr = lifecycle_req.trkorr
                  AND qa_life.transport_status = 'imported'
              ) THEN 'pending_prd'
              WHEN lifecycle_req.sap_system_code = 'DEV' AND lifecycle_req.status_group = 'released' THEN 'pending_qa'
              ELSE 'unknown'
            END AS lifecycle_status
          FROM cr_requests req
          LEFT JOIN cr_requests parent_req
            ON parent_req.sap_system_code = req.sap_system_code
           AND parent_req.trkorr = req.parent_request
          CROSS JOIN LATERAL (
            SELECT COALESCE(parent_req.sap_system_code, req.sap_system_code) AS sap_system_code,
                   COALESCE(parent_req.trkorr, req.trkorr) AS trkorr,
                   COALESCE(parent_req.status_group, req.status_group) AS status_group
          ) lifecycle_req
          WHERE req.sap_system_code = link.sap_system_code
            AND req.trkorr = link.trkorr
          LIMIT 1
        ) cr ON true
        WHERE link.issue_id = h.id
        ORDER BY link.is_primary DESC, link.trkorr
        LIMIT 1
      ) primary_cr ON true
    )
    SELECT issue_status, COUNT(*)::int AS count
    FROM issue_rows
    GROUP BY issue_status
    ORDER BY issue_status
  `);
  return rows;
}

export async function getNextIssueNumber() {
  return { issueNo: await nextIssueNo(pool) };
}

export async function getNextSubIssueNumber(issueNo: number | string) {
  const parsedIssueNo = Number(issueNo);
  if (!Number.isFinite(parsedIssueNo) || parsedIssueNo <= 0) throw new Error("Issue number is invalid.");

  const { rows } = await pool.query(`
    SELECT sub_issue_no
    FROM issue_headers
    WHERE issue_no = $1
    ORDER BY sub_issue_no
  `, [parsedIssueNo]);

  const used = new Set(rows.map((row) => Number(String(row.sub_issue_no || "").replace(/\D/g, ""))).filter((value) => Number.isFinite(value) && value > 0));
  let next = 1;
  while (used.has(next)) next += 1;
  return { issueNo: parsedIssueNo, subIssueNo: String(next).padStart(2, "0") };
}

export async function searchIssuePeople(q = "") {
  const needle = `%${q.trim().toUpperCase()}%`;
  const { rows } = await pool.query(`
    SELECT id, full_name, nickname, email, department
    FROM issue_people
    WHERE $1 = '%%'
       OR upper(coalesce(full_name, '')) LIKE $1
       OR upper(coalesce(nickname, '')) LIKE $1
       OR upper(coalesce(email, '')) LIKE $1
    ORDER BY coalesce(full_name, nickname)
    LIMIT 20
  `, [needle]);
  return rows;
}

export async function searchIssueGlpi(q = "") {
  const needle = `%${q.replace(/[^\d]/g, "")}%`;
  const { rows } = await pool.query(`
    SELECT DISTINCT ticket_number
    FROM issue_glpi_tickets
    WHERE $1 = '%%' OR ticket_number::text LIKE $1
    ORDER BY ticket_number DESC
    LIMIT 20
  `, [needle]);
  return rows;
}

export async function searchIssueCrHelpdesk(q = "") {
  const needle = `%${q.trim().toUpperCase()}%`;
  const { rows } = await pool.query(`
    SELECT DISTINCT cr_helpdesk_no
    FROM issue_cr_helpdesk_numbers
    WHERE $1 = '%%' OR upper(cr_helpdesk_no) LIKE $1
    ORDER BY cr_helpdesk_no DESC
    LIMIT 20
  `, [needle]);
  return rows;
}

export async function searchIssueCrLinks(q = "") {
  const needle = `%${q.trim().toUpperCase()}%`;
  const { rows } = await pool.query(`
    SELECT trkorr, sap_system_code, description, status_group
    FROM cr_requests
    WHERE parent_request IS NULL
      AND sap_system_code = 'DEV'
      AND upper(owner) = 'TRSTDEV'
      AND ($1 = '%%' OR upper(trkorr) LIKE $1 OR upper(coalesce(description, '')) LIKE $1)
    ORDER BY changed_date DESC NULLS LAST, changed_time DESC NULLS LAST, trkorr
    LIMIT 20
  `, [needle]);
  return rows;
}

export async function saveIssue(payload: IssueSavePayload) {
  const issueName = textOrNull(payload.issueName);
  if (!issueName) throw new Error("Issue name is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const requestedIssueNo = Number(payload.issueNo);
    const issueNo = payload.id
      ? requestedIssueNo
      : payload.createMode === "sub" && Number.isFinite(requestedIssueNo) && requestedIssueNo > 0
        ? requestedIssueNo
        : await nextIssueNo(client);
    const subIssueNo = textOrNull(payload.subIssueNo) || (payload.id ? "01" : payload.createMode === "sub" ? (await nextSubIssueNo(client, issueNo)) : "01");
    if (!Number.isFinite(issueNo) || issueNo <= 0) throw new Error("Issue number is invalid.");

    const requesterNames = splitNames(payload.requesterNames);
    const abaperNames = splitNames(payload.abaperNames);
    const requesterPrimary = requesterNames[0] ? await upsertPerson(client, requesterNames[0], "full_name") : null;
    const abaperPrimary = abaperNames[0] ? await upsertPerson(client, abaperNames[0], "full_name") : null;
    const sourceStatus = textOrNull(payload.sourceIssueStatus) || "open";

    const headerParams = [
      issueNo,
      subIssueNo,
      issueName,
      requesterPrimary?.id || null,
      requesterNames.join(", ") || null,
      textOrNull(payload.problemAnalysis),
      textOrNull(payload.impactAnalysis),
      abaperPrimary?.id || null,
      abaperNames.join(", ") || null,
      textOrNull(payload.emailSubject),
      dateOrNull(payload.createIssueDate),
      sourceStatus,
      sourceStatus === "cancelled" ? dateOrNull(payload.cancelledDate) : null,
      sourceStatus === "cancelled" ? textOrNull(payload.cancelledReason) : null
    ];

    let issueId: number;
    if (payload.id) {
      const update = await client.query(`
        UPDATE issue_headers
        SET issue_no = $1,
            sub_issue_no = $2,
            issue_name = $3,
            requester_person_id = $4,
            requester_name_snapshot = $5,
            problem_analysis = $6,
            impact_analysis = $7,
            abaper_person_id = $8,
            abaper_name_snapshot = $9,
            email_subject = $10,
            create_issue_date = $11::timestamptz,
            issue_status = $12,
            cancelled_date = $13::timestamptz,
            cancelled_reason = $14,
            updated_at = now()
        WHERE id = $15
        RETURNING id
      `, [...headerParams, payload.id]);
      if (!update.rows[0]) throw new Error("Issue not found.");
      issueId = Number(update.rows[0].id);
    } else {
      const insert = await client.query(`
        INSERT INTO issue_headers (
          issue_no, sub_issue_no, issue_name, requester_person_id, requester_name_snapshot,
          problem_analysis, impact_analysis, abaper_person_id, abaper_name_snapshot,
          email_subject, create_issue_date, issue_status, cancelled_date, cancelled_reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12, $13::timestamptz, $14)
        RETURNING id
      `, headerParams);
      issueId = Number(insert.rows[0].id);
    }

    await replaceGlpiTickets(client, issueId, payload.glpiTickets);
    await replaceCrHelpdeskNumbers(client, issueId, payload.crHelpdeskNumbers);
    await replaceCrLinks(client, issueId, payload.crLinks);
    await replaceParticipants(client, issueId, requesterNames, abaperNames, payload.participants || {});
    await upsertTimelines(client, issueId, payload.timeline || {}, payload.participants || {});

    await client.query("COMMIT");
    return getIssueDetail(issueId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelIssue(id: number, reason: string) {
  const issueId = Number(id);
  const cancelReason = textOrNull(reason);
  if (!Number.isFinite(issueId) || issueId <= 0) throw new Error("Issue id is invalid.");
  if (!cancelReason) throw new Error("Cancel reason is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`
      SELECT id, issue_status
      FROM issue_headers
      WHERE id = $1
      LIMIT 1
    `, [issueId]);
    const issue = current.rows[0];
    if (!issue) throw new Error("Issue not found.");

    await client.query(`
      UPDATE issue_headers
      SET issue_status = 'cancelled',
          cancelled_date = now(),
          cancelled_reason = $2,
          updated_at = now()
      WHERE id = $1
    `, [issueId, cancelReason]);

    await client.query("DELETE FROM issue_cr_links WHERE issue_id = $1", [issueId]);

    await client.query(`
      INSERT INTO issue_status_history (issue_id, from_status, to_status, reason)
      VALUES ($1, $2, 'cancelled', $3)
    `, [issueId, issue.issue_status || null, cancelReason]);

    await client.query("COMMIT");
    return getIssueDetail(issueId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteIssue(id: number) {
  const issueId = Number(id);
  if (!Number.isFinite(issueId) || issueId <= 0) throw new Error("Issue id is invalid.");

  const { rows } = await pool.query(`
    DELETE FROM issue_headers
    WHERE id = $1
    RETURNING id
  `, [issueId]);
  if (!rows[0]) throw new Error("Issue not found.");
  return { ok: true, id: issueId };
}

function deriveIssueProcessStatus(sourceStatus: string | undefined, crLinks: Array<{ lifecycle_status?: string; trkorr?: string }>) {
  if ((sourceStatus || "").toLowerCase() === "cancelled") return "cancelled";
  const primary = crLinks[0];
  if (!primary?.trkorr) return "open";
  return primary.lifecycle_status === "in_prd" ? "ok" : "in_progress";
}

async function nextIssueNo(client: Pick<typeof pool, "query">) {
  const yearPrefix = Number(String(new Date().getFullYear()).slice(-2));
  const lower = yearPrefix * 1000;
  const upper = lower + 999;
  const { rows } = await client.query(`
    SELECT COALESCE(MAX(issue_no), $1)::int AS max_issue_no
    FROM issue_headers
    WHERE issue_no BETWEEN $1 AND $2
  `, [lower, upper]);
  return Number(rows[0].max_issue_no) + 1;
}

async function nextSubIssueNo(client: Pick<typeof pool, "query">, issueNo: number) {
  const { rows } = await client.query(`
    SELECT sub_issue_no
    FROM issue_headers
    WHERE issue_no = $1
    ORDER BY sub_issue_no
  `, [issueNo]);
  const used = new Set(rows.map((row) => Number(String(row.sub_issue_no || "").replace(/\D/g, ""))).filter((value) => Number.isFinite(value) && value > 0));
  let next = 1;
  while (used.has(next)) next += 1;
  return String(next).padStart(2, "0");
}

async function upsertPerson(client: Pick<typeof pool, "query">, rawName: string, mode: "full_name" | "nickname") {
  const name = textOrNull(rawName);
  if (!name) return null;
  const lookupColumn = mode === "full_name" ? "full_name" : "nickname";
  const existing = await client.query(`
    SELECT id, full_name, nickname
    FROM issue_people
    WHERE lower(trim(${lookupColumn})) = lower(trim($1))
    LIMIT 1
  `, [name]);
  if (existing.rows[0]) return existing.rows[0];

  const insert = await client.query(`
    INSERT INTO issue_people (full_name, nickname, department)
    VALUES ($1, $2, 'IT')
    ON CONFLICT DO NOTHING
    RETURNING id, full_name, nickname
  `, [mode === "full_name" ? name : null, mode === "nickname" ? name : null]);
  if (insert.rows[0]) return insert.rows[0];

  const fallback = await client.query(`
    SELECT id, full_name, nickname
    FROM issue_people
    WHERE lower(trim(coalesce(full_name, nickname))) = lower(trim($1))
       OR lower(trim(coalesce(nickname, full_name))) = lower(trim($1))
    LIMIT 1
  `, [name]);
  return fallback.rows[0] || null;
}

async function replaceGlpiTickets(client: Pick<typeof pool, "query">, issueId: number, ticketsText?: string) {
  const tickets = splitNames(ticketsText)
    .map((item) => Number(item.replace(/[^\d]/g, "")))
    .filter((item, index, array) => Number.isFinite(item) && item > 0 && array.indexOf(item) === index);
  await client.query("DELETE FROM issue_glpi_tickets WHERE issue_id = $1", [issueId]);
  for (const [index, ticket] of tickets.entries()) {
    await client.query(`
      INSERT INTO issue_glpi_tickets (issue_id, ticket_number, is_primary)
      VALUES ($1, $2, $3)
    `, [issueId, ticket, index === 0]);
  }
}

async function replaceCrHelpdeskNumbers(client: Pick<typeof pool, "query">, issueId: number, numbersText?: string) {
  const numbers = splitNames(numbersText)
    .map((item) => item.trim())
    .filter((item, index, array) => item && array.findIndex((candidate) => candidate.toUpperCase() === item.toUpperCase()) === index);
  await client.query("DELETE FROM issue_cr_helpdesk_numbers WHERE issue_id = $1", [issueId]);
  for (const [index, crHelpdeskNo] of numbers.entries()) {
    await client.query(`
      INSERT INTO issue_cr_helpdesk_numbers (issue_id, cr_helpdesk_no, is_primary)
      VALUES ($1, $2, $3)
    `, [issueId, crHelpdeskNo, index === 0]);
  }
}

async function replaceCrLinks(client: Pick<typeof pool, "query">, issueId: number, crText?: string) {
  const links = splitNames(crText)
    .map((item) => item.toUpperCase())
    .filter((item, index, array) => item && array.indexOf(item) === index);
  await client.query("DELETE FROM issue_cr_links WHERE issue_id = $1", [issueId]);
  for (const [index, trkorr] of links.entries()) {
    const snapshot = await client.query(`
      SELECT description
      FROM cr_requests
      WHERE trkorr = $1
      ORDER BY CASE WHEN sap_system_code = 'DEV' THEN 0 ELSE 1 END
      LIMIT 1
    `, [trkorr]);
    await client.query(`
      INSERT INTO issue_cr_links (issue_id, sap_system_code, trkorr, relation_type, is_primary, cr_description_snapshot)
      VALUES ($1, 'DEV', $2, 'main', $3, $4)
    `, [issueId, trkorr, index === 0, snapshot.rows[0]?.description || null]);
  }
}

async function replaceParticipants(
  client: Pick<typeof pool, "query">,
  issueId: number,
  requesterNames: string[],
  abaperNames: string[],
  participants: Record<string, string | undefined>
) {
  await client.query("DELETE FROM issue_participants WHERE issue_id = $1", [issueId]);
  await insertParticipants(client, issueId, "requester", "requester", requesterNames, "full_name");
  await insertParticipants(client, issueId, "abaper", "abaper", abaperNames, "full_name");
  for (const role of PARTICIPANT_ROLES) {
    await insertParticipants(client, issueId, role, role, splitNames(participants[role]), "nickname");
  }
}

async function insertParticipants(
  client: Pick<typeof pool, "query">,
  issueId: number,
  role: string,
  sourceField: string,
  names: string[],
  mode: "full_name" | "nickname"
) {
  for (const [index, name] of names.entries()) {
    const person = await upsertPerson(client, name, mode);
    await client.query(`
      INSERT INTO issue_participants (issue_id, person_id, person_name_snapshot, role, source_field, is_primary)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [issueId, person?.id || null, displayPersonName(person, name), role, sourceField, index === 0]);
  }
}

async function upsertTimelines(client: Pick<typeof pool, "query">, issueId: number, timeline: Record<string, string | undefined>, participants: Record<string, string | undefined>) {
  const people = {
    dev_tester: await firstPerson(client, participants.dev_tester),
    dev_evaluator: await firstPerson(client, participants.dev_evaluator),
    qa_transporter: await firstPerson(client, participants.qa_transporter),
    qa_tester: await firstPerson(client, participants.qa_tester),
    qa_evaluator: await firstPerson(client, participants.qa_evaluator),
    prd_requester: await firstPerson(client, participants.prd_requester),
    prd_evaluator: await firstPerson(client, participants.prd_evaluator),
    approval: await firstPerson(client, participants.approval),
    executor: await firstPerson(client, participants.executor)
  };

  await client.query(`
    INSERT INTO issue_dev_timeline (issue_id, dev_tested_date, dev_tester_person_id, dev_tester_name_snapshot, dev_evaluated_date, dev_evaluator_person_id, dev_evaluator_name_snapshot, updated_at)
    VALUES ($1, $2::timestamptz, $3, $4, $5::timestamptz, $6, $7, now())
    ON CONFLICT (issue_id) DO UPDATE SET
      dev_tested_date = EXCLUDED.dev_tested_date,
      dev_tester_person_id = EXCLUDED.dev_tester_person_id,
      dev_tester_name_snapshot = EXCLUDED.dev_tester_name_snapshot,
      dev_evaluated_date = EXCLUDED.dev_evaluated_date,
      dev_evaluator_person_id = EXCLUDED.dev_evaluator_person_id,
      dev_evaluator_name_snapshot = EXCLUDED.dev_evaluator_name_snapshot,
      updated_at = now()
  `, [issueId, dateOrNull(timeline.dev_tested_date), people.dev_tester?.id || null, people.dev_tester?.name || null, dateOrNull(timeline.dev_evaluated_date), people.dev_evaluator?.id || null, people.dev_evaluator?.name || null]);

  await client.query(`
    INSERT INTO issue_qa_timeline (issue_id, transported_by_person_id, transported_by_name_snapshot, qa_tested_date, qa_tester_person_id, qa_tester_name_snapshot, qa_evaluated_date, qa_evaluator_person_id, qa_evaluator_name_snapshot, updated_at)
    VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::timestamptz, $8, $9, now())
    ON CONFLICT (issue_id) DO UPDATE SET
      transported_by_person_id = EXCLUDED.transported_by_person_id,
      transported_by_name_snapshot = EXCLUDED.transported_by_name_snapshot,
      qa_tested_date = EXCLUDED.qa_tested_date,
      qa_tester_person_id = EXCLUDED.qa_tester_person_id,
      qa_tester_name_snapshot = EXCLUDED.qa_tester_name_snapshot,
      qa_evaluated_date = EXCLUDED.qa_evaluated_date,
      qa_evaluator_person_id = EXCLUDED.qa_evaluator_person_id,
      qa_evaluator_name_snapshot = EXCLUDED.qa_evaluator_name_snapshot,
      updated_at = now()
  `, [issueId, people.qa_transporter?.id || null, people.qa_transporter?.name || null, dateOrNull(timeline.qa_tested_date), people.qa_tester?.id || null, people.qa_tester?.name || null, dateOrNull(timeline.qa_evaluated_date), people.qa_evaluator?.id || null, people.qa_evaluator?.name || null]);

  await client.query(`
    INSERT INTO issue_prd_timeline (issue_id, prd_requester_person_id, prd_requester_name_snapshot, prd_requested_date, prd_evaluator_person_id, prd_evaluator_name_snapshot, prd_evaluated_date, approval_person_id, approval_name_snapshot, approval_date, executor_person_id, executor_name_snapshot, updated_at)
    VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::timestamptz, $8, $9, $10::timestamptz, $11, $12, now())
    ON CONFLICT (issue_id) DO UPDATE SET
      prd_requester_person_id = EXCLUDED.prd_requester_person_id,
      prd_requester_name_snapshot = EXCLUDED.prd_requester_name_snapshot,
      prd_requested_date = EXCLUDED.prd_requested_date,
      prd_evaluator_person_id = EXCLUDED.prd_evaluator_person_id,
      prd_evaluator_name_snapshot = EXCLUDED.prd_evaluator_name_snapshot,
      prd_evaluated_date = EXCLUDED.prd_evaluated_date,
      approval_person_id = EXCLUDED.approval_person_id,
      approval_name_snapshot = EXCLUDED.approval_name_snapshot,
      approval_date = EXCLUDED.approval_date,
      executor_person_id = EXCLUDED.executor_person_id,
      executor_name_snapshot = EXCLUDED.executor_name_snapshot,
      updated_at = now()
  `, [issueId, people.prd_requester?.id || null, people.prd_requester?.name || null, dateOrNull(timeline.prd_requested_date), people.prd_evaluator?.id || null, people.prd_evaluator?.name || null, dateOrNull(timeline.prd_evaluated_date), people.approval?.id || null, people.approval?.name || null, dateOrNull(timeline.approval_date), people.executor?.id || null, people.executor?.name || null]);
}

async function firstPerson(client: Pick<typeof pool, "query">, rawNames?: string) {
  const name = splitNames(rawNames)[0];
  if (!name) return null;
  const person = await upsertPerson(client, name, "nickname");
  return { id: person?.id || null, name: displayPersonName(person, name) };
}

function splitNames(value?: string) {
  return (value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textOrNull(value?: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function dateOrNull(value?: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value || "") ? value : null;
}

function displayPersonName(person: { full_name?: string; nickname?: string } | null, fallback: string) {
  return person?.full_name || person?.nickname || fallback;
}

const PARTICIPANT_ROLES = [
  "dev_tester",
  "dev_evaluator",
  "qa_transporter",
  "qa_tester",
  "qa_evaluator",
  "prd_requester",
  "prd_evaluator",
  "approval",
  "executor"
];
