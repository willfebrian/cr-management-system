import { pool } from "../db/pool";

type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

export class PeopleAdminError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "PeopleAdminError";
  }
}

function isUserPersonForeignKeyConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === "23503" && candidate.constraint === "fk_app_users_person";
}

export function createPeopleAdminService(
  database: Queryable = pool as unknown as Queryable
) {
  async function findAssignedAccount(personId: number) {
    const linked = await database.query(
      `SELECT id, username
         FROM app_users
        WHERE person_id = $1
        ORDER BY id
        LIMIT 1`,
      [personId]
    );
    return linked.rows[0];
  }

  function linkedPersonError(owner?: { id: unknown; username: unknown }) {
    return new PeopleAdminError(
      owner
        ? `Person masih terhubung ke akun ${owner.username}. Unassign akun terlebih dahulu.`
        : "Person masih terhubung ke akun. Unassign akun terlebih dahulu.",
      409,
      "PERSON_LINKED_TO_USER",
      owner
        ? { assignedUserId: Number(owner.id), assignedUsername: owner.username }
        : {}
    );
  }

  async function deleteAdminPerson(personId: number): Promise<void> {
    const owner = await findAssignedAccount(personId);
    if (owner) {
      throw linkedPersonError(owner);
    }
    try {
      const deleted = await database.query(
        `DELETE FROM issue_people WHERE id = $1 RETURNING id`,
        [personId]
      );
      if (!deleted.rows[0]) {
        throw new PeopleAdminError("Person tidak ditemukan", 404, "PERSON_NOT_FOUND");
      }
    } catch (error) {
      if (isUserPersonForeignKeyConflict(error)) {
        throw linkedPersonError(await findAssignedAccount(personId));
      }
      throw error;
    }
  }

  return { deleteAdminPerson };
}

export const { deleteAdminPerson } = createPeopleAdminService();
