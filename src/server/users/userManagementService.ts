import { hashPassword } from "../auth/authService";
import { pool } from "../db/pool";
import type {
  CreateManagedUserPayload,
  ManagedUser,
  ManagedUserListFilters,
  ManagedUserListResult,
  ManagedUserPerson,
  ManagedUserPersonOption,
  ManagementActor,
  RestoreManagedUserPayload,
  UpdateManagedUserProfilePayload,
  UserAuditAction,
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

function toManagedUserPerson(row: any): ManagedUserPerson | null {
  if (row.person_id == null) return null;
  return {
    id: Number(row.person_id),
    fullName: row.person_full_name ?? null,
    nickname: row.person_nickname ?? null,
    email: row.person_email ?? null,
    isActive: Boolean(row.person_is_active)
  };
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
    deleteReason: row.delete_reason ?? null,
    person: toManagedUserPerson(row)
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
            u.deleted_by_snapshot, u.delete_reason, u.person_id,
            (SELECT p.full_name FROM issue_people p WHERE p.id = u.person_id) AS person_full_name,
            (SELECT p.nickname FROM issue_people p WHERE p.id = u.person_id) AS person_nickname,
            (SELECT p.email FROM issue_people p WHERE p.id = u.person_id) AS person_email,
            (SELECT p.is_active FROM issue_people p WHERE p.id = u.person_id) AS person_is_active
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

async function getManagedUserById(
  client: Queryable,
  userId: number
): Promise<ManagedUser> {
  const result = await client.query(
    `SELECT u.id, u.username, u.role, u.is_active, u.must_change_password,
            u.last_login_at, u.created_at, u.updated_at, u.deleted_at,
            u.deleted_by_snapshot, u.delete_reason, u.person_id,
            p.full_name AS person_full_name,
            p.nickname AS person_nickname,
            p.email AS person_email,
            p.is_active AS person_is_active
       FROM app_users u
       LEFT JOIN issue_people p ON p.id = u.person_id
      WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new UserManagementError("User tidak ditemukan", 404);
  return toManagedUser(row);
}

async function insertUserAudit(
  client: Queryable,
  actor: ManagementActor,
  targetUserId: number,
  action: UserAuditAction,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO app_user_audit_logs (
       actor_user_id, target_user_id, action, metadata
     ) VALUES ($1, $2, $3, $4::jsonb)`,
    [
      actor.id,
      targetUserId,
      action,
      JSON.stringify({ ...metadata, actorUsername: actor.username })
    ]
  );
}

function personDisplayName(person: {
  full_name?: string | null;
  nickname?: string | null;
}): string | null {
  const fullName = String(person.full_name ?? "").trim();
  const nickname = String(person.nickname ?? "").trim();
  if (fullName && nickname) return `${fullName} (${nickname})`;
  return fullName || nickname || null;
}

function assignmentMetadata(previous: any | null, next: any | null) {
  return {
    previousPersonId: previous?.id == null ? null : Number(previous.id),
    previousPersonName: previous ? personDisplayName(previous) : null,
    nextPersonId: next?.id == null ? null : Number(next.id),
    nextPersonName: next ? personDisplayName(next) : null
  };
}

function isPersonUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === "23505"
    && candidate.constraint === "idx_app_users_person_unique";
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
      values.push(`%${filters.q.trim()}%`);
      clauses.push(`(
        u.username ILIKE $${values.length}
        OR p.full_name ILIKE $${values.length}
        OR p.nickname ILIKE $${values.length}
      )`);
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
      `SELECT count(*)::text AS total
         FROM app_users u
         LEFT JOIN issue_people p ON p.id = u.person_id
        WHERE ${where}`,
      values
    );
    const pageValues = [...values, pageSize, (page - 1) * pageSize];
    const rows = await database.query(
      `SELECT u.id, u.username, u.role, u.is_active, u.must_change_password,
              u.last_login_at, u.created_at, u.updated_at, u.deleted_at,
              u.deleted_by_snapshot, u.delete_reason, u.person_id,
              p.full_name AS person_full_name,
              p.nickname AS person_nickname,
              p.email AS person_email,
              p.is_active AS person_is_active
         FROM app_users u
         LEFT JOIN issue_people p ON p.id = u.person_id
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

  async function listManagedUserPersonOptions(
    query: string,
    actor: ManagementActor
  ): Promise<ManagedUserPersonOption[]> {
    assertAdmin(actor);
    const value = `%${String(query ?? "").trim()}%`;
    const result = await database.query(
      `SELECT p.id, p.full_name, p.nickname, p.email, p.is_active,
              u.id AS assigned_user_id,
              u.username AS assigned_username,
              u.deleted_at AS assigned_user_deleted_at
         FROM issue_people p
         LEFT JOIN app_users u ON u.person_id = p.id
        WHERE p.full_name ILIKE $1 OR p.nickname ILIKE $1
        ORDER BY coalesce(p.full_name, p.nickname), p.id
        LIMIT 100`,
      [value]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      fullName: row.full_name ?? null,
      nickname: row.nickname ?? null,
      email: row.email ?? null,
      isActive: Boolean(row.is_active),
      assignedUser: row.assigned_user_id == null ? null : {
        id: Number(row.assigned_user_id),
        username: String(row.assigned_username),
        deletedAt: nullableIso(row.assigned_user_deleted_at)
      }
    }));
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

  async function assignManagedUserPerson(
    userId: number,
    personId: number,
    actor: ManagementActor
  ): Promise<ManagedUser> {
    assertAdmin(actor);
    if (!Number.isSafeInteger(personId) || personId <= 0) {
      throw new UserManagementError("Person ID tidak valid");
    }
    try {
      return await inTransaction(database, async (client) => {
        const target = await getTargetForUpdate(client, userId);
        if (target.deleted_at) {
          throw new UserManagementError(
            "Archived user harus dipulihkan sebelum assignment diubah",
            404,
            "USER_ASSIGNMENT_UNAVAILABLE"
          );
        }
        const personResult = await client.query(
          `SELECT id, full_name, nickname, email, is_active
             FROM issue_people
            WHERE id = $1
            FOR UPDATE`,
          [personId]
        );
        const nextPerson = personResult.rows[0];
        if (!nextPerson) {
          throw new UserManagementError("Person tidak ditemukan", 404, "PERSON_NOT_FOUND");
        }
        if (!nextPerson.is_active) {
          throw new UserManagementError(
            "Person inactive tidak dapat di-assign",
            409,
            "PERSON_INACTIVE"
          );
        }
        if (target.person_id != null && Number(target.person_id) === personId) {
          return toManagedUser(target);
        }
        const ownerResult = await client.query(
          `SELECT id, username
             FROM app_users
            WHERE person_id = $1 AND id <> $2`,
          [personId, userId]
        );
        const owner = ownerResult.rows[0];
        if (owner) {
          throw new UserManagementError(
            `Person sudah terhubung ke akun ${owner.username}`,
            409,
            "PERSON_ALREADY_ASSIGNED",
            { assignedUserId: Number(owner.id), assignedUsername: owner.username }
          );
        }
        const previous = target.person_id == null ? null : {
          id: target.person_id,
          full_name: target.person_full_name,
          nickname: target.person_nickname
        };
        await client.query(
          `UPDATE app_users SET person_id = $1, updated_at = now()
            WHERE id = $2
            RETURNING id`,
          [personId, userId]
        );
        await insertUserAudit(
          client,
          actor,
          userId,
          previous ? "PERSON_REASSIGNED" : "PERSON_ASSIGNED",
          assignmentMetadata(previous, nextPerson)
        );
        return getManagedUserById(client, userId);
      });
    } catch (error) {
      if (isPersonUniqueConflict(error)) {
        throw new UserManagementError(
          "Person sudah terhubung ke akun lain",
          409,
          "PERSON_ALREADY_ASSIGNED"
        );
      }
      throw error;
    }
  }

  async function unassignManagedUserPerson(
    userId: number,
    actor: ManagementActor
  ): Promise<ManagedUser> {
    assertAdmin(actor);
    return inTransaction(database, async (client) => {
      const target = await getTargetForUpdate(client, userId);
      if (target.deleted_at) {
        throw new UserManagementError(
          "Archived user harus dipulihkan sebelum assignment diubah",
          404,
          "USER_ASSIGNMENT_UNAVAILABLE"
        );
      }
      if (target.person_id == null) return toManagedUser(target);
      const previous = {
        id: target.person_id,
        full_name: target.person_full_name,
        nickname: target.person_nickname
      };
      await client.query(
        `UPDATE app_users SET person_id = NULL, updated_at = now() WHERE id = $1`,
        [userId]
      );
      await insertUserAudit(
        client,
        actor,
        userId,
        "PERSON_UNASSIGNED",
        assignmentMetadata(previous, null)
      );
      return getManagedUserById(client, userId);
    });
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
    listManagedUserPersonOptions,
    assignManagedUserPerson,
    unassignManagedUserPerson,
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
export const listManagedUserPersonOptions = defaultService.listManagedUserPersonOptions;
export const assignManagedUserPerson = defaultService.assignManagedUserPerson;
export const unassignManagedUserPerson = defaultService.unassignManagedUserPerson;
export const getManagedUserAudit = defaultService.getManagedUserAudit;
export const createManagedUser = defaultService.createManagedUser;
export const updateManagedUserProfile = defaultService.updateManagedUserProfile;
export const setManagedUserStatus = defaultService.setManagedUserStatus;
export const resetManagedUserPassword = defaultService.resetManagedUserPassword;
export const revokeManagedUserSessions = defaultService.revokeManagedUserSessions;
export const archiveManagedUser = defaultService.archiveManagedUser;
export const restoreManagedUser = defaultService.restoreManagedUser;
