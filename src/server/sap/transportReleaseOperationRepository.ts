import { pool } from "../db/pool.js";
import type { ReleaseResult } from "./transportReleaseService.js";

export type ReleaseOperationStatus = "queued" | "running" | "succeeded" | "failed" | "timed_out";
export type ReleaseOperationPhase = "queued" | "releasing_children" | "releasing_parent" | "verifying";
export type ReleaseOperationSyncStatus = "not_queued" | "queued" | "running" | "succeeded" | "failed";

export type ReleaseOperation = {
  id: string;
  trkorr: string;
  targetSystem: string;
  status: ReleaseOperationStatus;
  phase: ReleaseOperationPhase;
  message: string | null;
  result: ReleaseResult | null;
  syncStatus: ReleaseOperationSyncStatus;
  syncMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

type Query = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

const defaultQuery: Query = (sql, params) => pool.query(sql, params);

export async function createOrGetActiveReleaseOperation(
  input: { trkorr: string; targetSystem: string },
  query: Query = defaultQuery
): Promise<ReleaseOperation> {
  const trkorr = input.trkorr.trim().toUpperCase();
  const targetSystem = input.targetSystem.trim().toUpperCase();
  const result = await query(
    `INSERT INTO cr_management.release_operations (trkorr, target_system)
     VALUES ($1, $2)
     ON CONFLICT (target_system, trkorr)
       WHERE status IN ('queued', 'running')
     DO UPDATE SET updated_at = cr_management.release_operations.updated_at
     RETURNING *`,
    [trkorr, targetSystem]
  );
  if (!result.rows[0]) throw new Error("RELEASE_OPERATION_CREATE_FAILED");
  return mapReleaseOperation(result.rows[0]);
}

export async function findReleaseOperation(
  id: string,
  query: Query = defaultQuery
): Promise<ReleaseOperation | null> {
  const result = await query(
    `SELECT * FROM cr_management.release_operations WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? mapReleaseOperation(result.rows[0]) : null;
}

export async function claimReleaseOperation(
  id: string,
  query: Query = defaultQuery
): Promise<ReleaseOperation | null> {
  const result = await query(
    `UPDATE cr_management.release_operations
        SET status = 'running',
            phase = 'releasing_children',
            message = 'Waiting for SAP to confirm child tasks and parent request',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
      WHERE id = $1
        AND status = 'queued'
      RETURNING *`,
    [id]
  );
  return result.rows[0] ? mapReleaseOperation(result.rows[0]) : null;
}

export async function updateReleaseOperation(
  id: string,
  patch: {
    status: ReleaseOperationStatus;
    phase?: ReleaseOperationPhase;
    message?: string | null;
    result?: ReleaseResult | null;
    syncStatus?: ReleaseOperationSyncStatus;
    syncMessage?: string | null;
  },
  query: Query = defaultQuery
): Promise<ReleaseOperation> {
  const result = await query(
    `UPDATE cr_management.release_operations
        SET status = $2,
            phase = COALESCE($3, phase),
            message = COALESCE($4, message),
            result = COALESCE($5::jsonb, result),
            sync_status = COALESCE($6, sync_status),
            sync_message = COALESCE($7, sync_message),
            started_at = CASE
              WHEN $2 = 'running' THEN COALESCE(started_at, now())
              ELSE started_at
            END,
            finished_at = CASE
              WHEN $2 IN ('succeeded', 'failed', 'timed_out') THEN COALESCE(finished_at, now())
              ELSE finished_at
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      patch.status,
      patch.phase ?? null,
      patch.message ?? null,
      patch.result === undefined ? null : JSON.stringify(patch.result),
      patch.syncStatus ?? null,
      patch.syncMessage ?? null
    ]
  );
  if (!result.rows[0]) throw new Error("RELEASE_OPERATION_NOT_FOUND");
  return mapReleaseOperation(result.rows[0]);
}

export async function updateReleaseOperationSync(
  id: string,
  syncStatus: ReleaseOperationSyncStatus,
  syncMessage: string | null,
  query: Query = defaultQuery
): Promise<ReleaseOperation> {
  const result = await query(
    `UPDATE cr_management.release_operations
        SET sync_status = $2,
            sync_message = $3,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, syncStatus, syncMessage]
  );
  if (!result.rows[0]) throw new Error("RELEASE_OPERATION_NOT_FOUND");
  return mapReleaseOperation(result.rows[0]);
}

export function mapReleaseOperation(row: any): ReleaseOperation {
  const timestamp = (value: unknown) => value instanceof Date ? value.toISOString() : String(value || "") || null;
  return {
    id: String(row.id),
    trkorr: String(row.trkorr || ""),
    targetSystem: String(row.target_system || ""),
    status: row.status,
    phase: row.phase,
    message: row.message == null ? null : String(row.message),
    result: row.result || null,
    syncStatus: row.sync_status,
    syncMessage: row.sync_message == null ? null : String(row.sync_message),
    createdAt: timestamp(row.created_at) || "",
    startedAt: timestamp(row.started_at),
    finishedAt: timestamp(row.finished_at),
    updatedAt: timestamp(row.updated_at) || ""
  };
}
