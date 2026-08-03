import { hashPassword } from "../auth/authService";
import { pool } from "../db/pool";
import type {
  CreateManagedUserPayload,
  ManagedUser,
  ManagedUserListFilters,
  ManagedUserListResult,
  ManagementActor,
  RestoreManagedUserPayload,
  UpdateManagedUserProfilePayload,
  UserAuditEntry,
  UserRole
} from "../../shared/userManagementTypes";
import {
  assertArchiveAllowed,
  assertInitialPassword,
  assertRoleChangeAllowed,
  assertStatusChangeAllowed,
  assertUsernameChangeAllowed,
  normalizeManagedUsername,
  UserManagementError
} from "./userManagementDomain";

type QueryResult = { rows: any[]; rowCount?: number | null };
type Queryable = {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
};
type Database = Queryable & {
  connect(): Promise<Queryable & { release(): void }>;
};
type PasswordHasher = (password: string) => Promise<string>;

function assertAdmin(actor: ManagementActor): void {
  if (actor.role !== "ADMIN") {
    throw new UserManagementError("Administrator access required", 403);
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableIso(value: unknown): string | null {
  return value == null ? null : toIso(value);
}

function toManagedUser(row: any): ManagedUser {
  return {
    id: Number(row.id),
    username: String(row.username),
    role: row.role,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: nullableIso(row.last_login_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: nullableIso(row.deleted_at),
    deletedBySnapshot: row.deleted_by_snapshot ?? null,
    deleteReason: row.delete_reason ?? null
  };
}

function toAuditEntry(row: any): UserAuditEntry {
  return {
    id: Number(row.id),
    actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actorUsername: row.actor_username ?? null,
    targetUserId: Number(row.target_user_id),
    action: row.action,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at)
  };
}

async function inTransaction<T>(
  database: Database,
  operation: (client: Queryable) => Promise<T>
): Promise<T> {
  const client = await database.connect();
  await client.query("BEGIN");
  try {
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function lockManagementGuards(client: Queryable): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('app-users-active-admin'))"
  );
}

async function getTargetForUpdate(
  client: Queryable,
  userId: number
): Promise<any> {
  const result = await client.query(
    `SELECT u.id, u.username, u.role, u.is_active, u.must_change_password,
            u.last_login_at, u.created_at, u.updated_at, u.deleted_at,
            u.deleted_by_snapshot, u.delete_reason
       FROM app_users u
      WHERE u.id = $1
      FOR UPDATE`,
    [userId]
  );
  const target = result.rows[0];
  if (!target) {
    throw new UserManagementError("User tidak ditemukan", 404);
  }
  return target;
}

async function getActiveAdminCount(client: Queryable): Promise<number> {
  const result = await client.query(
    `SELECT count(*)::text AS active_admin_count
       FROM app_users
      WHERE role = 'ADMIN'
        AND is_active = TRUE
        AND deleted_at IS NULL`
  );
  return Number(result.rows[0]?.active_admin_count ?? 0);
}

async function revokeSessions(client: Queryable, userId: number): Promise<void> {
  await client.query(
    `UPDATE app_user_sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL`,
    [userId]
  );
}

export function createUserManagementService(
  database: Database = pool as unknown as Database,
  passwordHasher: PasswordHasher = hashPassword
) {
  async function listManagedUsers(
    filters: ManagedUserListFilters,
    actor: ManagementActor
  ): Promise<ManagedUserListResult> {
    assertAdmin(actor);
    const page = Math.max(1, Math.trunc(filters.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
    const clauses = [
      filters.scope === "archived" ? "u.deleted_at IS NOT NULL" : "u.deleted_at IS NULL"
    ];
    const values: unknown[] = [];
    if (filters.q?.trim()) {
      values.push(`%${normalizeManagedUsername(filters.q)}%`);
      clauses.push(`u.username ILIKE $${values.length}`);
    }
    if (filters.role) {
      values.push(filters.role);
      clauses.push(`u.role = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status === "active");
      clauses.push(`u.is_active = $${values.length}`);
    }
    const where = clauses.join(" AND ");
    const countResult = await database.query(
      `SELECT count(*)::text AS total FROM app_users u WHERE ${where}`,
      values
    );
    const pageValues = [...values, pageSize, (page - 1) * pageSize];
    const rows = await database.query(
      `SELECT u.id, u.username, u.role, u.is_active, u.must_change_password,
              u.last_login_at, u.created_at, u.updated_at, u.deleted_at,
              u.deleted_by_snapshot, u.delete_reason
         FROM app_users u
        WHERE ${where}
        ORDER BY u.username
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      pageValues
    );
    return {
      users: rows.rows.map(toManagedUser),
      page,
      pageSize,
      total: Number(countResult.rows[0]?.total ?? 0)
    };
  }

  async function getManagedUserAudit(
    userId: number,
    actor: ManagementActor
  ): Promise<UserAuditEntry[]> {
    assertAdmin(actor);
    const result = await database.query(
      `SELECT l.id, l.actor_user_id, actor.username AS actor_username,
              l.target_user_id, l.action, l.metadata, l.created_at
         FROM app_user_audit_logs l
         LEFT JOIN app_users actor ON actor.id = l.actor_user_id
        WHERE l.target_user_id = $1
        ORDER BY l.created_at DESC, l.id DESC`,
      [userId]
    );
    return result.rows.map(toAuditEntry);
  }

  async function createManagedUser(
    payload: CreateManagedUserPayload,
    actor: ManagementActor
  ): Promise<ManagedUser> {
    assertAdmin(actor);
    const username = normalizeManagedUsername(payload.username);
    assertInitialPassword(payload.password);
    if (payload.role !== "ADMIN" && payload.role !== "USER") {
      throw new UserManagementError("Role tidak valid");
    }
    return inTransaction(database, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `app-user-username:${username}`
      ]);
      const reservation = await client.query(
        `SELECT r.user_id, r.is_current, u.deleted_at
           FROM app_user_usernames r
           JOIN app_users u ON u.id = r.user_id
          WHERE r.normalized_username = $1`,
        [username]
      );
      const existing = reservation.rows[0];
      if (existing) {
        if (existing.deleted_at) {
          throw new UserManagementError(
            "Username dimiliki user yang diarsipkan. Gunakan Restore.",
            409,
            "ARCHIVED_USERNAME",
            { archivedUserId: Number(existing.user_id), canRestore: true }
          );
        }
        throw new UserManagementError(
          "Username telah direservasi dan tidak dapat digunakan kembali",
          409,
          "USERNAME_RESERVED"
        );
      }
      const passwordHash = await passwordHasher(payload.password);
      const inserted = await client.query(
        `INSERT INTO app_users (username, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, role, is_active, must_change_password,
                   last_login_at, created_at, updated_at, deleted_at,
                   deleted_by_snapshot, delete_reason`,
        [username, passwordHash, payload.role, payload.isActive ?? true]
      );
      const user = toManagedUser(inserted.rows[0]);
      await client.query(
        `INSERT INTO app_user_usernames (
           normalized_username, display_username, user_id, is_current,
           changed_by_user_id, changed_by_snapshot
         ) VALUES ($1, $2, $3, TRUE, $4, $5)`,
        [username, username, user.id, actor.id, actor.username]
      );
      await client.query(
        `INSERT INTO app_user_audit_logs (
           actor_user_id, target_user_id, action, metadata
         ) VALUES ($1, $2, 'USER_CREATED', $3::jsonb)`,
        [
          actor.id,
          user.id,
          JSON.stringify({
            username,
            role: payload.role,
            isActive: payload.isActive ?? true,
            actorUsername: actor.username
          })
        ]
      );
      return user;
    });
  }

  async function updateManagedUserProfile(
    userId: number,
    payload: UpdateManagedUserProfilePayload,
    actor: ManagementActor
  ): Promise<ManagedUser> {
    assertAdmin(actor);
    if (payload.username == null && payload.role == null) {
      throw new UserManagementError("Tidak ada perubahan profil");
    }
    if (payload.role != null && payload.role !== "ADMIN" && payload.role !== "USER") {
      throw new UserManagementError("Role tidak valid");
    }
    return inTransaction(database, async (client) => {
      await lockManagementGuards(client);
      const row = await getTargetForUpdate(client, userId);
      const target = toManagedUser(row);
      const activeAdminCount = await getActiveAdminCount(client);
      const nextUsername = payload.username == null
        ? target.username
        : normalizeManagedUsername(payload.username);
      const nextRole: UserRole = payload.role ?? target.role;
      const usernameChanged = nextUsername !== normalizeManagedUsername(target.username);
      const roleChanged = nextRole !== target.role;

      if (usernameChanged) {
        assertUsernameChangeAllowed(target, actor, nextUsername);
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `app-user-username:${nextUsername}`
        ]);
        const reservation = await client.query(
          `SELECT r.user_id, r.is_current, u.deleted_at
             FROM app_user_usernames r
             JOIN app_users u ON u.id = r.user_id
            WHERE r.normalized_username = $1`,
          [nextUsername]
        );
        const existing = reservation.rows[0];
        if (existing && Number(existing.user_id) !== userId) {
          throw new UserManagementError(
            "Username telah direservasi dan tidak dapat digunakan kembali",
            409,
            "USERNAME_RESERVED"
          );
        }
        await client.query(
          `UPDATE app_user_usernames
              SET is_current = FALSE, retired_at = now(),
                  changed_by_user_id = $3, changed_by_snapshot = $4
            WHERE user_id = $1
              AND normalized_username = $2
              AND is_current`,
          [userId, normalizeManagedUsername(target.username), actor.id, actor.username]
        );
        if (existing) {
          await client.query(
            `UPDATE app_user_usernames
                SET is_current = TRUE, retired_at = NULL,
                    display_username = $2, changed_by_user_id = $3,
                    changed_by_snapshot = $4
              WHERE normalized_username = $1`,
            [nextUsername, nextUsername, actor.id, actor.username]
          );
        } else {
          await client.query(
            `INSERT INTO app_user_usernames (
               normalized_username, display_username, user_id, is_current,
               changed_by_user_id, changed_by_snapshot
             ) VALUES ($1, $2, $3, TRUE, $4, $5)`,
            [nextUsername, nextUsername, userId, actor.id, actor.username]
          );
        }
      }

      if (roleChanged) {
        assertRoleChangeAllowed(target, actor, activeAdminCount, nextRole);
      }

      const updatedResult = await client.query(
        `UPDATE app_users
            SET username = $1, role = $2, updated_at = now()
          WHERE id = $3
          RETURNING id, username, role, is_active, must_change_password,
                    last_login_at, created_at, updated_at, deleted_at,
                    deleted_by_snapshot, delete_reason`,
        [nextUsername, nextRole, userId]
      );
      const updated = toManagedUser(updatedResult.rows[0]);

      if (usernameChanged) {
        await client.query(
          `INSERT INTO app_user_audit_logs (
             actor_user_id, target_user_id, action, metadata
           ) VALUES ($1, $2, 'USERNAME_CHANGED', $3::jsonb)`,
          [
            actor.id,
            userId,
            JSON.stringify({
              before: target.username,
              after: nextUsername,
              actorUsername: actor.username
            })
          ]
        );
      }
      if (roleChanged) {
        await client.query(
          `INSERT INTO app_user_audit_logs (
             actor_user_id, target_user_id, action, metadata
           ) VALUES ($1, $2, 'ROLE_CHANGED', $3::jsonb)`,
          [
            actor.id,
            userId,
            JSON.stringify({
              before: target.role,
              after: nextRole,
              actorUsername: actor.username
            })
          ]
        );
      }
      if (usernameChanged || roleChanged) {
        await revokeSessions(client, userId);
      }
      return updated;
    });
  }

  async function setManagedUserStatus(
    userId: number,
    isActive: boolean,
    actor: ManagementActor
  ): Promise<ManagedUser> {
    assertAdmin(actor);
    if (typeof isActive !== "boolean") {
      throw new UserManagementError("Status tidak valid");
    }
    return inTransaction(database, async (client) => {
      await lockManagementGuards(client);
      const row = await getTargetForUpdate(client, userId);
      const target = toManagedUser(row);
      const activeAdminCount = await getActiveAdminCount(client);
      assertStatusChangeAllowed(target, actor, activeAdminCount, isActive);
      const updatedResult = await client.query(
        `UPDATE app_users
            SET is_active = $1, updated_at = now()
          WHERE id = $2
          RETURNING id, username, role, is_active, must_change_password,
                    last_login_at, created_at, updated_at, deleted_at,
                    deleted_by_snapshot, delete_reason`,
        [isActive, userId]
      );
      const updated = toManagedUser(updatedResult.rows[0]);
      if (target.isActive !== isActive) {
        if (!isActive) {
          await revokeSessions(client, userId);
        }
        const action = isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED";
        await client.query(
          `INSERT INTO app_user_audit_logs (
             actor_user_id, target_user_id, action, metadata
           ) VALUES ($1, $2, '${action}', $3::jsonb)`,
          [
            actor.id,
            userId,
            JSON.stringify({
              before: target.isActive,
              after: isActive,
              actorUsername: actor.username
            })
          ]
        );
      }
      return updated;
    });
  }

  async function resetManagedUserPassword(
    userId: number,
    password: string,
    actor: ManagementActor
  ): Promise<void> {
    assertAdmin(actor);
    assertInitialPassword(password);
    await inTransaction(database, async (client) => {
      const row = await getTargetForUpdate(client, userId);
      const target = toManagedUser(row);
      if (target.deletedAt) {
        throw new UserManagementError("Archived user harus dipulihkan", 404);
      }
      if (target.id === actor.id) {
        throw new UserManagementError(
          "Gunakan Change Password untuk akun sendiri",
          403,
          "SELF_PASSWORD_RESET"
        );
      }
      const passwordHash = await passwordHasher(password);
      await client.query(
        `UPDATE app_users
            SET password_hash = $1,
                must_change_password = TRUE,
                password_changed_at = NULL,
                updated_at = now()
          WHERE id = $2`,
        [passwordHash, userId]
      );
      await revokeSessions(client, userId);
      await client.query(
        `INSERT INTO app_user_audit_logs (
           actor_user_id, target_user_id, action, metadata
         ) VALUES ($1, $2, 'PASSWORD_RESET', $3::jsonb)`,
        [
          actor.id,
          userId,
          JSON.stringify({
            targetUsername: target.username,
            actorUsername: actor.username
          })
        ]
      );
    });
  }

  async function revokeManagedUserSessions(
    userId: number,
    actor: ManagementActor
  ): Promise<void> {
    assertAdmin(actor);
    await inTransaction(database, async (client) => {
      const row = await getTargetForUpdate(client, userId);
      const target = toManagedUser(row);
      if (target.deletedAt) {
        throw new UserManagementError("Archived user tidak memiliki sesi aktif", 404);
      }
      await revokeSessions(client, userId);
      await client.query(
        `INSERT INTO app_user_audit_logs (
           actor_user_id, target_user_id, action, metadata
         ) VALUES ($1, $2, 'SESSIONS_REVOKED', $3::jsonb)`,
        [
          actor.id,
          userId,
          JSON.stringify({
            targetUsername: target.username,
            actorUsername: actor.username
          })
        ]
      );
    });
  }

  async function archiveManagedUser(
    userId: number,
    reason: string,
    actor: ManagementActor
  ): Promise<void> {
    assertAdmin(actor);
    const normalizedReason = String(reason ?? "").trim();
    if (!normalizedReason) {
      throw new UserManagementError("Alasan archive wajib diisi");
    }
    await inTransaction(database, async (client) => {
      await lockManagementGuards(client);
      const row = await getTargetForUpdate(client, userId);
      const target = toManagedUser(row);
      const activeAdminCount = await getActiveAdminCount(client);
      assertArchiveAllowed(target, actor, activeAdminCount);
      await client.query(
        `UPDATE app_users
            SET deleted_at = now(),
                deleted_by_user_id = $1,
                deleted_by_snapshot = $2,
                delete_reason = $3,
                is_active = FALSE,
                updated_at = now()
          WHERE id = $4`,
        [actor.id, actor.username, normalizedReason, userId]
      );
      await revokeSessions(client, userId);
      await client.query(
        `INSERT INTO app_user_audit_logs (
           actor_user_id, target_user_id, action, metadata
         ) VALUES ($1, $2, 'USER_ARCHIVED', $3::jsonb)`,
        [
          actor.id,
          userId,
          JSON.stringify({
            targetUsername: target.username,
            reason: normalizedReason,
            actorUsername: actor.username
          })
        ]
      );
    });
  }

  async function restoreManagedUser(
    userId: number,
    payload: RestoreManagedUserPayload,
    actor: ManagementActor
  ): Promise<ManagedUser> {
    assertAdmin(actor);
    assertInitialPassword(payload.password);
    if (payload.role !== "ADMIN" && payload.role !== "USER") {
      throw new UserManagementError("Role tidak valid");
    }
    if (typeof payload.isActive !== "boolean") {
      throw new UserManagementError("Status restore tidak valid");
    }
    return inTransaction(database, async (client) => {
      await lockManagementGuards(client);
      const row = await getTargetForUpdate(client, userId);
      const target = toManagedUser(row);
      if (!target.deletedAt) {
        throw new UserManagementError("User tidak berada di archive", 409);
      }
      const passwordHash = await passwordHasher(payload.password);
      const updatedResult = await client.query(
        `UPDATE app_users
            SET password_hash = $1,
                role = $2,
                is_active = $3,
                must_change_password = TRUE,
                password_changed_at = NULL,
                deleted_at = NULL,
                deleted_by_user_id = NULL,
                deleted_by_snapshot = NULL,
                delete_reason = NULL,
                updated_at = now()
          WHERE id = $4
          RETURNING id, username, role, is_active, must_change_password,
                    last_login_at, created_at, updated_at, deleted_at,
                    deleted_by_snapshot, delete_reason`,
        [passwordHash, payload.role, payload.isActive, userId]
      );
      const restored = toManagedUser(updatedResult.rows[0]);
      await revokeSessions(client, userId);
      await client.query(
        `INSERT INTO app_user_audit_logs (
           actor_user_id, target_user_id, action, metadata
         ) VALUES ($1, $2, 'USER_RESTORED', $3::jsonb)`,
        [
          actor.id,
          userId,
          JSON.stringify({
            targetUsername: target.username,
            role: payload.role,
            isActive: payload.isActive,
            actorUsername: actor.username
          })
        ]
      );
      return restored;
    });
  }

  return {
    listManagedUsers,
    getManagedUserAudit,
    createManagedUser,
    updateManagedUserProfile,
    setManagedUserStatus,
    resetManagedUserPassword,
    revokeManagedUserSessions,
    archiveManagedUser,
    restoreManagedUser
  };
}

const defaultService = createUserManagementService();

export const listManagedUsers = defaultService.listManagedUsers;
export const getManagedUserAudit = defaultService.getManagedUserAudit;
export const createManagedUser = defaultService.createManagedUser;
export const updateManagedUserProfile = defaultService.updateManagedUserProfile;
export const setManagedUserStatus = defaultService.setManagedUserStatus;
export const resetManagedUserPassword = defaultService.resetManagedUserPassword;
export const revokeManagedUserSessions = defaultService.revokeManagedUserSessions;
export const archiveManagedUser = defaultService.archiveManagedUser;
export const restoreManagedUser = defaultService.restoreManagedUser;
