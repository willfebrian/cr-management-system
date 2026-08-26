import { pool } from "../db/pool.js";
import { findGlpiUserIdsByEmails } from "../db/glpiMariaRepository.js";

type IssueActorDatabase = {
  query(sql: string, params: unknown[]): Promise<{ rows: Array<{ role: string; email: string | null }> }>;
};

type GlpiUserLookup = (emails: string[]) => Promise<number[]>;

export async function resolveGlpiPrefillActors(
  issueId: number,
  database: IssueActorDatabase = pool,
  lookupGlpiUsers: GlpiUserLookup = findGlpiUserIdsByEmails
) {
  const { rows } = await database.query(
    `SELECT participant.role, people.email
     FROM issue_participants participant
     JOIN issue_people people ON people.id = participant.person_id
     WHERE participant.issue_id = $1
       AND participant.role IN ('requester', 'abaper')
       AND NULLIF(TRIM(COALESCE(people.email, '')), '') IS NOT NULL
     ORDER BY participant.role, participant.id`,
    [issueId]
  );
  const emailsForRole = (role: "requester" | "abaper") => rows
    .filter((row) => row.role === role)
    .map((row) => String(row.email || ""));
  const [requesterGlpiUserIds, abaperGlpiUserIds] = await Promise.all([
    lookupGlpiUsers(emailsForRole("requester")),
    lookupGlpiUsers(emailsForRole("abaper"))
  ]);

  return { requesterGlpiUserIds, abaperGlpiUserIds };
}
