import "dotenv/config";
import { pool } from "../src/server/db/pool.ts";

const apply = process.argv.includes("--apply");
const canonicalPeople = [
  { badNickname: "Alif Noor", fullName: "Alif Noor", nickname: "Alif", department: "IT" },
  { badNickname: "Alfa Nur Fitriana Islami", fullName: "Alfa Nur Fitriana Islami", nickname: "Alfa", department: "IT" },
  { badNickname: "Althof Ghulam Ishaq", fullName: "Althof Ghulam Ishaq", nickname: "Althof", department: "IT" },
  { badNickname: "Fiqih Hidayaturrahman", fullName: "Fiqih Hidayaturrahman", nickname: "Fiqih", department: "IT" }
];

const references = [
  ["issue_headers", "requester_person_id"],
  ["issue_headers", "abaper_person_id"],
  ["issue_headers", "cancelled_by_person_id"],
  ["issue_dev_timeline", "dev_tester_person_id"],
  ["issue_dev_timeline", "dev_evaluator_person_id"],
  ["issue_qa_timeline", "transported_by_person_id"],
  ["issue_qa_timeline", "qa_tester_person_id"],
  ["issue_qa_timeline", "qa_evaluator_person_id"],
  ["issue_prd_timeline", "prd_requester_person_id"],
  ["issue_prd_timeline", "prd_evaluator_person_id"],
  ["issue_prd_timeline", "approval_person_id"],
  ["issue_prd_timeline", "executor_person_id"],
  ["issue_participants", "person_id"],
  ["issue_status_history", "changed_by_person_id"]
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actions = [];

    for (const person of canonicalPeople) {
      const canonical = await upsertCanonical(client, person);
      const bad = await client.query(
        "SELECT id, full_name, nickname FROM issue_people WHERE full_name IS NULL AND lower(trim(nickname)) = lower(trim($1))",
        [person.badNickname]
      );
      for (const row of bad.rows) {
        if (Number(row.id) === Number(canonical.id)) continue;
        const refCount = await countReferences(client, row.id);
        actions.push({
          bad_id: row.id,
          bad_nickname: row.nickname,
          canonical_id: canonical.id,
          canonical_full_name: person.fullName,
          canonical_nickname: person.nickname,
          references: refCount
        });
        if (apply) {
          for (const [table, column] of references) {
            await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [canonical.id, row.id]);
          }
          await client.query("DELETE FROM issue_people WHERE id = $1", [row.id]);
        }
      }
    }

    console.table(actions);
    console.log(JSON.stringify({ apply, fixed_rows: actions.length }, null, 2));

    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function upsertCanonical(client, person) {
  const existing = await client.query(
    "SELECT id FROM issue_people WHERE lower(trim(full_name)) = lower(trim($1)) LIMIT 1",
    [person.fullName]
  );
  if (existing.rows[0]) {
    if (apply) {
      await client.query(
        "UPDATE issue_people SET nickname = COALESCE(NULLIF(trim(nickname), ''), $2), department = COALESCE(NULLIF(trim(department), ''), $3), updated_at = now() WHERE id = $1",
        [existing.rows[0].id, person.nickname, person.department]
      );
    }
    return existing.rows[0];
  }

  if (!apply) return { id: `new:${person.fullName}` };
  const inserted = await client.query(
    "INSERT INTO issue_people (full_name, nickname, department) VALUES ($1, $2, $3) RETURNING id",
    [person.fullName, person.nickname, person.department]
  );
  return inserted.rows[0];
}

async function countReferences(client, personId) {
  let count = 0;
  for (const [table, column] of references) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`, [personId]);
    count += Number(rows[0]?.count || 0);
  }
  return count;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
