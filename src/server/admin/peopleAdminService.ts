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

function isForeignKeyConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23503");
}

export function createPeopleAdminService(
  database: Queryable = pool as unknown as Queryable
) {
  async function deleteAdminPerson(personId: number): Promise<void> {
    const linked = await database.query(
      `SELECT id, username
         FROM app_users
        WHERE person_id = $1
        ORDER BY id
        LIMIT 1`,
      [personId]
    );
    const owner = linked.rows[0];
    if (owner) {
      throw new PeopleAdminError(
        `Person masih terhubung ke akun ${owner.username}. Unassign akun terlebih dahulu.`,
        409,
        "PERSON_LINKED_TO_USER",
        { assignedUserId: Number(owner.id), assignedUsername: owner.username }
      );
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
      if (isForeignKeyConflict(error)) {
        throw new PeopleAdminError(
          "Person masih terhubung ke akun. Unassign akun terlebih dahulu.",
          409,
          "PERSON_LINKED_TO_USER"
        );
      }
      throw error;
    }
  }

  return { deleteAdminPerson };
}

export const { deleteAdminPerson } = createPeopleAdminService();
