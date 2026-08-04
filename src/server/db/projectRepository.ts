import type { PoolClient, QueryResultRow } from "pg";
import type { AuthUser } from "../auth/authService.js";
import type {
  ProjectDetail,
  ProjectFilters,
  ProjectIssue,
  ProjectIssueOption,
  ProjectListResult,
  ProjectOwnerOption,
  ProjectRow,
  ProjectSavePayload,
  ProjectStatusHistory
} from "../../shared/projectTypes.js";
import { assertProjectTransition, diffIssueLinks, validateProjectPayload } from "../projects/projectDomain.js";
import { pool } from "./pool.js";

export class ProjectRepositoryError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ProjectRepositoryError";
  }
}

export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectListResult> {
  const page = positiveInteger(filters.page, 1);
  const pageSize = Math.min(positiveInteger(filters.pageSize, 25), 100);
  const where: string[] = [];
  const params: unknown[] = [];
  const q = filters.q?.trim();
  if (q) {
    params.push(`%${q.toUpperCase()}%`);
    where.push(`(
      upper(h.project_key) LIKE $${params.length}
      OR upper(h.project_name) LIKE $${params.length}
      OR upper(coalesce(h.description, '')) LIKE $${params.length}
      OR upper(h.owner_name_snapshot) LIKE $${params.length}
    )`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`h.project_status = $${params.length}`);
  }
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(`
    SELECT h.*,
           COUNT(l.id)::int AS issue_count,
           (h.project_status = 'cancelled' AND h.project_no = (
             SELECT MAX(candidate.project_no) FROM project_headers candidate
           )) AS can_delete,
           COUNT(*) OVER()::int AS total_count
    FROM project_headers h
    LEFT JOIN project_issue_links l ON l.project_id = h.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY h.id
    ORDER BY h.project_no DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  const total = Number(rows[0]?.total_count || 0);
  return {
    rows: rows.map(mapProjectRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1)
  };
}

export async function getProjectDetail(id: number): Promise<ProjectDetail> {
  const projectId = requireId(id, "Project");
  const header = await pool.query(`
    SELECT h.*,
           COUNT(l.id)::int AS issue_count,
           (h.project_status = 'cancelled' AND h.project_no = (
             SELECT MAX(candidate.project_no) FROM project_headers candidate
           )) AS can_delete
    FROM project_headers h
    LEFT JOIN project_issue_links l ON l.project_id = h.id
    WHERE h.id = $1
    GROUP BY h.id
  `, [projectId]);
  if (!header.rows[0]) throw new ProjectRepositoryError("Project not found", 404, "PROJECT_NOT_FOUND");
  const project = mapProjectRow(header.rows[0]);

  const issueResult = project.projectStatus === "cancelled"
    ? await pool.query(`
        SELECT hist.id AS history_id, hist.issue_id,
               hist.issue_key_snapshot AS issue_key,
               hist.issue_name_snapshot AS issue_name,
               hist.issue_status_snapshot AS issue_status,
               hist.relation_status, hist.linked_at, hist.unlinked_at, hist.reason
        FROM project_issue_link_history hist
        WHERE hist.project_id = $1 OR (
          hist.project_id IS NULL AND hist.project_key_snapshot = $2
        )
        ORDER BY hist.linked_at, hist.id
      `, [projectId, project.projectKey])
    : await pool.query(`
        SELECT l.id AS link_id, h.id AS issue_id,
               h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
               h.issue_name, h.issue_status,
               h.requester_name_snapshot AS requester_name,
               h.abaper_name_snapshot AS abaper_name,
               primary_cr.trkorr AS primary_cr,
               'active'::text AS relation_status,
               l.linked_at
        FROM project_issue_links l
        JOIN issue_headers h ON h.id = l.issue_id
        LEFT JOIN LATERAL (
          SELECT trkorr FROM issue_cr_links
          WHERE issue_id = h.id
          ORDER BY is_primary DESC, id
          LIMIT 1
        ) primary_cr ON true
        WHERE l.project_id = $1
        ORDER BY h.issue_no, h.sub_issue_no
      `, [projectId]);
  const statusResult = await pool.query(`
    SELECT id, from_status, to_status, reason,
           changed_by_snapshot, changed_at
    FROM project_status_history
    WHERE project_id = $1 OR (project_id IS NULL AND project_key_snapshot = $2)
    ORDER BY changed_at, id
  `, [projectId, project.projectKey]);
  return {
    project,
    issues: issueResult.rows.map(mapProjectIssue),
    statusHistory: statusResult.rows.map(mapStatusHistory)
  };
}

export async function searchProjectIssueOptions(
  query: string,
  excludeProjectId?: number
): Promise<ProjectIssueOption[]> {
  const params: unknown[] = [`%${query.trim().toUpperCase()}%`, excludeProjectId || null];
  const { rows } = await pool.query(`
    SELECT h.id AS issue_id,
           h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
           h.issue_name, h.issue_status,
           h.requester_name_snapshot AS requester_name,
           h.abaper_name_snapshot AS abaper_name,
           primary_cr.trkorr AS primary_cr,
           owner.id AS owning_project_id,
           owner.project_key AS owning_project_key,
           owner.project_name AS owning_project_name,
           (owner.id = $2::bigint) AS owned_by_excluded_project
    FROM issue_headers h
    LEFT JOIN LATERAL (
      SELECT trkorr FROM issue_cr_links
      WHERE issue_id = h.id
      ORDER BY is_primary DESC, id
      LIMIT 1
    ) primary_cr ON true
    LEFT JOIN project_issue_links current_link ON current_link.issue_id = h.id
    LEFT JOIN project_headers owner ON owner.id = current_link.project_id
    WHERE (
      upper(h.issue_no::text || '-' || h.sub_issue_no) LIKE $1
      OR upper(h.issue_name) LIKE $1
      OR upper(coalesce(h.requester_name_snapshot, '')) LIKE $1
      OR upper(coalesce(h.abaper_name_snapshot, '')) LIKE $1
      OR upper(coalesce(primary_cr.trkorr, '')) LIKE $1
    )
    ORDER BY h.issue_no DESC, h.sub_issue_no DESC
    LIMIT 50
  `, params);
  return rows.map((row) => ({
    issueId: Number(row.issue_id),
    issueKey: row.issue_key,
    issueName: row.issue_name,
    issueStatus: row.issue_status,
    requesterName: row.requester_name,
    abaperName: row.abaper_name,
    primaryCr: row.primary_cr,
    owningProjectId: row.owning_project_id == null ? null : Number(row.owning_project_id),
    owningProjectKey: row.owning_project_key,
    owningProjectName: row.owning_project_name,
    available: String(row.issue_status || "").toLowerCase() !== "cancelled"
      && (row.owning_project_id == null || Number(row.owning_project_id) === Number(excludeProjectId))
  }));
}

export async function searchProjectOwners(query = ""): Promise<ProjectOwnerOption[]> {
  const { rows } = await pool.query(`
    SELECT id AS person_id, full_name, nickname, department
    FROM issue_people
    WHERE is_active = true
      AND (
        $1 = '' OR upper(coalesce(full_name, '')) LIKE $2
        OR upper(coalesce(nickname, '')) LIKE $2
        OR upper(coalesce(department, '')) LIKE $2
      )
    ORDER BY coalesce(full_name, nickname)
    LIMIT 50
  `, [query.trim(), `%${query.trim().toUpperCase()}%`]);
  return rows.map((row) => ({
    personId: Number(row.person_id),
    fullName: row.full_name || row.nickname,
    nickname: row.nickname,
    department: row.department
  }));
}

export async function saveProject(payload: ProjectSavePayload, actor: AuthUser): Promise<ProjectDetail> {
  const normalized = validateProjectPayload(payload);
  const client = await pool.connect();
  let projectId = normalized.id;
  try {
    await client.query("BEGIN");
    const actorSnapshot = actorName(actor);
    let current: QueryResultRow | undefined;
    if (projectId) {
      const result = await client.query(`
        SELECT id, project_key, project_name, project_status
        FROM project_headers
        WHERE id = $1
        FOR UPDATE
      `, [projectId]);
      current = result.rows[0];
      if (!current) throw new ProjectRepositoryError("Project not found", 404, "PROJECT_NOT_FOUND");
      assertProjectTransition(current.project_status, normalized.projectStatus);
    }

    const ownerResult = await client.query(`
      SELECT id, coalesce(full_name, nickname) AS owner_name
      FROM issue_people
      WHERE id = $1 AND is_active = true
    `, [normalized.ownerPersonId]);
    const owner = ownerResult.rows[0];
    if (!owner) throw new ProjectRepositoryError("Project owner is invalid or inactive");

    const currentLinkResult = projectId
      ? await client.query(
          "SELECT issue_id FROM project_issue_links WHERE project_id = $1 ORDER BY issue_id FOR UPDATE",
          [projectId]
        )
      : { rows: [] };
    const currentIssueIds = currentLinkResult.rows.map((row) => Number(row.issue_id));
    const currentIssueIdSet = new Set(currentIssueIds);

    const selectedIssues = normalized.issueIds.length
      ? await client.query(`
          SELECT id,
                 issue_no::text || '-' || sub_issue_no AS issue_key,
                 issue_name, issue_status
          FROM issue_headers
          WHERE id = ANY($1::bigint[])
          ORDER BY id
          FOR UPDATE
        `, [normalized.issueIds])
      : { rows: [] };
    if (selectedIssues.rows.length !== normalized.issueIds.length) {
      throw new ProjectRepositoryError("One or more selected Issues do not exist");
    }
    const cancelledIssue = selectedIssues.rows.find((row) =>
      String(row.issue_status || "").toLowerCase() === "cancelled"
      && !currentIssueIdSet.has(Number(row.id))
    );
    if (cancelledIssue) {
      throw new ProjectRepositoryError(`Cancelled Issue ${cancelledIssue.issue_key} cannot be added to a Project`);
    }

    if (normalized.issueIds.length) {
      const conflictResult = await client.query(`
        SELECT l.issue_id, l.project_id, h.project_key
        FROM project_issue_links l
        JOIN project_headers h ON h.id = l.project_id
        WHERE l.issue_id = ANY($1::bigint[])
          AND ($2::bigint IS NULL OR l.project_id <> $2)
        LIMIT 1
      `, [normalized.issueIds, projectId || null]);
      const conflict = conflictResult.rows[0];
      if (conflict) {
        throw new ProjectRepositoryError(
          `Issue ${conflict.issue_id} already belongs to active Project ${conflict.project_key}`,
          409,
          "ISSUE_PROJECT_CONFLICT"
        );
      }
    }

    let projectKey = current?.project_key as string | undefined;
    let projectNameSnapshot = normalized.projectName;
    let previousStatus = current?.project_status as ProjectRow["projectStatus"] | undefined;
    if (!projectId) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('project_number'))");
      const numberResult = await client.query(`
        SELECT COALESCE(MAX(project_no), $1 - 1) + 1 AS next_project_no
        FROM project_headers
        WHERE project_no BETWEEN $1 AND $2
      `, [yearNumberFloor(), yearNumberFloor() + 998]);
      const projectNo = Number(numberResult.rows[0]?.next_project_no || yearNumberFloor());
      projectKey = `PRJ-${projectNo}`;
      const insert = await client.query(`
        INSERT INTO project_headers (
          project_no, project_key, project_name, description,
          owner_person_id, owner_name_snapshot, project_status,
          created_by_user_id, created_by_snapshot,
          updated_by_user_id, updated_by_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $9)
        RETURNING id
      `, [
        projectNo, projectKey, normalized.projectName, normalized.description || null,
        normalized.ownerPersonId, owner.owner_name, normalized.projectStatus,
        actor.id, actorSnapshot
      ]);
      projectId = Number(insert.rows[0].id);
    } else {
      await client.query(`
        UPDATE project_headers
        SET project_name = $2,
            description = $3,
            owner_person_id = $4,
            owner_name_snapshot = $5,
            project_status = $6,
            updated_by_user_id = $7,
            updated_by_snapshot = $8,
            updated_at = now()
        WHERE id = $1
      `, [
        projectId, normalized.projectName, normalized.description || null,
        normalized.ownerPersonId, owner.owner_name, normalized.projectStatus,
        actor.id, actorSnapshot
      ]);
    }

    const { added, removed } = diffIssueLinks(
      currentIssueIds,
      normalized.issueIds
    );

    if (removed.length) {
      await client.query(`
        UPDATE project_issue_link_history
        SET relation_status = 'removed',
            unlinked_by_user_id = $3,
            unlinked_by_snapshot = $4,
            unlinked_at = now(),
            reason = 'Removed through Change Project'
        WHERE project_id = $1
          AND issue_id = ANY($2::bigint[])
          AND relation_status = 'active'
      `, [projectId, removed, actor.id, actorSnapshot]);
      await client.query(
        "DELETE FROM project_issue_links WHERE project_id = $1 AND issue_id = ANY($2::bigint[])",
        [projectId, removed]
      );
    }

    if (added.length) {
      await client.query(`
        INSERT INTO project_issue_links (
          project_id, issue_id, linked_by_user_id, linked_by_snapshot
        )
        SELECT $1, selected.issue_id, $3, $4
        FROM unnest($2::bigint[]) AS selected(issue_id)
      `, [projectId, added, actor.id, actorSnapshot]);
      await client.query(`
        INSERT INTO project_issue_link_history (
          project_id, issue_id, project_key_snapshot, project_name_snapshot,
          issue_key_snapshot, issue_name_snapshot, issue_status_snapshot,
          relation_status, linked_by_user_id, linked_by_snapshot
        )
        SELECT $1, issue.id, $3, $4,
               issue.issue_no::text || '-' || issue.sub_issue_no,
               issue.issue_name, issue.issue_status,
               'active', $5, $6
        FROM issue_headers issue
        WHERE issue.id = ANY($2::bigint[])
      `, [projectId, added, projectKey, projectNameSnapshot, actor.id, actorSnapshot]);
    }

    if (!previousStatus || previousStatus !== normalized.projectStatus) {
      await client.query(`
        INSERT INTO project_status_history (
          project_id, project_key_snapshot, project_name_snapshot,
          from_status, to_status, changed_by_user_id, changed_by_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        projectId, projectKey, projectNameSnapshot, previousStatus || null,
        normalized.projectStatus, actor.id, actorSnapshot
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new ProjectRepositoryError(
        "One of the selected Issues was assigned to another active Project",
        409,
        "ISSUE_PROJECT_CONFLICT"
      );
    }
    throw error;
  } finally {
    client.release();
  }
  return getProjectDetail(projectId!);
}

export async function cancelProject(id: number, reason: string, actor: AuthUser): Promise<ProjectDetail> {
  const projectId = requireId(id, "Project");
  const cancelReason = reason?.trim();
  if (!cancelReason) throw new ProjectRepositoryError("Project cancel reason is required");
  const actorSnapshot = actorName(actor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(`
      SELECT id, project_key, project_name, project_status
      FROM project_headers
      WHERE id = $1
      FOR UPDATE
    `, [projectId]);
    const current = currentResult.rows[0];
    if (!current) throw new ProjectRepositoryError("Project not found", 404, "PROJECT_NOT_FOUND");
    if (current.project_status === "cancelled") {
      throw new ProjectRepositoryError("Cancelled Projects are read-only", 409, "PROJECT_CANCELLED");
    }

    await client.query(`
      UPDATE project_headers
      SET project_status = 'cancelled',
          updated_by_user_id = $2,
          updated_by_snapshot = $3,
          updated_at = now(),
          cancelled_by_user_id = $2,
          cancelled_by_snapshot = $3,
          cancelled_at = now(),
          cancelled_reason = $4
      WHERE id = $1
    `, [projectId, actor.id, actorSnapshot, cancelReason]);
    await client.query(`
      UPDATE project_issue_link_history
      SET relation_status = 'cancelled',
          unlinked_by_user_id = $2,
          unlinked_by_snapshot = $3,
          unlinked_at = now(),
          reason = $4
      WHERE project_id = $1 AND relation_status = 'active'
    `, [projectId, actor.id, actorSnapshot, cancelReason]);
    await client.query("DELETE FROM project_issue_links WHERE project_id = $1", [projectId]);
    await client.query(`
      INSERT INTO project_status_history (
        project_id, project_key_snapshot, project_name_snapshot,
        from_status, to_status, reason,
        changed_by_user_id, changed_by_snapshot
      )
      VALUES ($1, $2, $3, $4, 'cancelled', $5, $6, $7)
    `, [
      projectId, current.project_key, current.project_name, current.project_status,
      cancelReason, actor.id, actorSnapshot
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getProjectDetail(projectId);
}

export async function deleteProject(id: number, actor: AuthUser): Promise<{ ok: true; id: number }> {
  const projectId = requireId(id, "Project");
  const actorSnapshot = actorName(actor);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('project_number'))");
    const currentResult = await client.query(`
      SELECT id, project_no, project_key, project_name, project_status
      FROM project_headers
      WHERE id = $1
      FOR UPDATE
    `, [projectId]);
    const current = currentResult.rows[0];
    if (!current) throw new ProjectRepositoryError("Project not found", 404, "PROJECT_NOT_FOUND");
    const highestResult = await client.query("SELECT MAX(project_no) AS max_project_no FROM project_headers");
    if (
      current.project_status !== "cancelled"
      || Number(current.project_no) !== Number(highestResult.rows[0]?.max_project_no)
    ) {
      throw new ProjectRepositoryError(
        "Only the latest cancelled Project can be deleted",
        409,
        "PROJECT_DELETE_NOT_ALLOWED"
      );
    }
    await client.query(`
      UPDATE project_issue_link_history
      SET relation_status = 'deleted',
          unlinked_by_user_id = $2,
          unlinked_by_snapshot = $3,
          unlinked_at = now(),
          reason = 'Project deleted'
      WHERE project_id = $1 AND relation_status = 'active'
    `, [projectId, actor.id, actorSnapshot]);
    const deleted = await client.query(`
      DELETE FROM project_headers
      WHERE id = $1
      RETURNING id
    `, [projectId]);
    await client.query("COMMIT");
    return { ok: true, id: Number(deleted.rows[0].id) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findActiveProjectForIssue(
  issueId: number,
  queryable: Pick<typeof pool, "query"> = pool
): Promise<{ projectId: number; projectKey: string; projectName: string } | null> {
  const normalizedIssueId = requireId(issueId, "Issue");
  const { rows } = await queryable.query(`
    SELECT h.id AS project_id, h.project_key, h.project_name
    FROM project_issue_links l
    JOIN project_headers h ON h.id = l.project_id
    WHERE l.issue_id = $1
    LIMIT 1
  `, [normalizedIssueId]);
  const project = rows[0];
  return project
    ? {
        projectId: Number(project.project_id),
        projectKey: project.project_key,
        projectName: project.project_name
      }
    : null;
}

function mapProjectRow(row: QueryResultRow): ProjectRow {
  return {
    id: Number(row.id),
    projectNo: Number(row.project_no),
    projectKey: row.project_key,
    projectName: row.project_name,
    description: row.description,
    ownerPersonId: Number(row.owner_person_id),
    ownerName: row.owner_name_snapshot,
    projectStatus: row.project_status,
    canDelete: row.can_delete === true,
    issueCount: Number(row.issue_count || 0),
    createdBy: row.created_by_snapshot,
    createdAt: iso(row.created_at),
    updatedBy: row.updated_by_snapshot,
    updatedAt: iso(row.updated_at),
    cancelledBy: row.cancelled_by_snapshot,
    cancelledAt: nullableIso(row.cancelled_at),
    cancelledReason: row.cancelled_reason
  };
}

function mapProjectIssue(row: QueryResultRow): ProjectIssue {
  return {
    linkId: nullableNumber(row.link_id),
    historyId: nullableNumber(row.history_id),
    issueId: nullableNumber(row.issue_id),
    issueKey: row.issue_key,
    issueName: row.issue_name,
    issueStatus: row.issue_status,
    requesterName: row.requester_name,
    abaperName: row.abaper_name,
    primaryCr: row.primary_cr,
    relationStatus: row.relation_status,
    linkedAt: nullableIso(row.linked_at),
    unlinkedAt: nullableIso(row.unlinked_at),
    reason: row.reason
  };
}

function mapStatusHistory(row: QueryResultRow): ProjectStatusHistory {
  return {
    id: Number(row.id),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    changedBy: row.changed_by_snapshot,
    changedAt: iso(row.changed_at)
  };
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requireId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ProjectRepositoryError(`${label} id is invalid`);
  }
  return id;
}

function nullableNumber(value: unknown) {
  return value == null ? null : Number(value);
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown) {
  return value == null ? null : iso(value);
}

function actorName(actor: AuthUser) {
  const username = actor.username?.trim();
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0 || !username) {
    throw new ProjectRepositoryError("Authenticated Project actor is invalid");
  }
  return username;
}

function yearNumberFloor(date = new Date()) {
  return Number(String(date.getFullYear()).slice(-2)) * 1000 + 1;
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}
