import { pool } from "./pool.js";

export type ActivityType = "sync" | "issue" | "project" | "master_data" | "setting" | "auth" | "admin";

export type ActivityLogInput = {
  activityType: ActivityType;
  action: string;
  username: string;
  userId?: number | null;
  description: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export type ActivityLogFilters = {
  activityType?: string;
  q?: string;
  username?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
};

let tableEnsured = false;

export async function ensureAuditLogTable() {
  if (tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activity_type VARCHAR(50) NOT NULL,
      action VARCHAR(100) NOT NULL,
      username TEXT NOT NULL,
      user_id BIGINT,
      description TEXT NOT NULL,
      metadata JSONB,
      ip_address TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(activity_type);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_username ON activity_logs(username);
  `);
  tableEnsured = true;
}

export async function recordActivityLog(input: ActivityLogInput) {
  try {
    await ensureAuditLogTable();
    
    // 1. Insert activity log
    await pool.query(
      `INSERT INTO activity_logs (activity_type, action, username, user_id, description, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.activityType,
        input.action,
        input.username || "system",
        input.userId || null,
        input.description,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ipAddress || null
      ]
    );

    // 2. Auto-purge records older than 1 year
    await pool.query(`DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '1 year'`);
  } catch (err) {
    console.error("[AuditLog Error] Failed to record activity log:", err);
  }
}

export async function listActivityLogs(filters: ActivityLogFilters = {}) {
  await ensureAuditLogTable();
  
  // Auto-purge records older than 1 year on fetch as well
  await pool.query(`DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '1 year'`);

  const where: string[] = [];
  const params: unknown[] = [];
  const page = Math.max(Number(filters.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize || 25), 1), 100);
  const offset = (page - 1) * pageSize;

  if (filters.activityType && filters.activityType !== "all") {
    params.push(filters.activityType);
    where.push(`activity_type = $${params.length}`);
  }

  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`created_at >= $${params.length}::date`);
  }

  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`created_at <= ($${params.length}::date + INTERVAL '1 day')`);
  }

  if (filters.username) {
    params.push(`%${filters.username.toUpperCase()}%`);
    where.push(`upper(username) LIKE $${params.length}`);
  }

  const query = filters.q?.trim();
  if (query) {
    params.push(`%${query.toUpperCase()}%`);
    where.push(`(
      upper(username) LIKE $${params.length}
      OR upper(description) LIKE $${params.length}
      OR upper(action) LIKE $${params.length}
      OR upper(activity_type) LIKE $${params.length}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM activity_logs
    ${whereSql}
  `, params);
  const total = Number(countResult.rows[0]?.total || 0);

  const queryParams = [...params, pageSize, offset];
  const { rows } = await pool.query(`
    SELECT
      id,
      created_at::text AS created_at,
      activity_type,
      action,
      username,
      user_id,
      description,
      metadata,
      ip_address
    FROM activity_logs
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `, queryParams);

  // Fetch summary counts per category
  const summaryResult = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE activity_type = 'sync')::int AS sync_count,
      COUNT(*) FILTER (WHERE activity_type = 'issue')::int AS issue_count,
      COUNT(*) FILTER (WHERE activity_type = 'project')::int AS project_count,
      COUNT(*) FILTER (WHERE activity_type = 'master_data')::int AS master_data_count,
      COUNT(*) FILTER (WHERE activity_type = 'setting')::int AS setting_count,
      COUNT(*) FILTER (WHERE activity_type = 'auth')::int AS auth_count
    FROM activity_logs
  `);

  const summary = summaryResult.rows[0] || {
    total: 0,
    sync_count: 0,
    issue_count: 0,
    project_count: 0,
    master_data_count: 0,
    setting_count: 0,
    auth_count: 0
  };

  return {
    rows,
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    summary
  };
}
