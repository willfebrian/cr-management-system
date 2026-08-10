import assert from "node:assert/strict";
import test from "node:test";
import {
  createPeopleAdminService,
  PeopleAdminError
} from "../src/server/admin/peopleAdminService";

class ScriptedDatabase {
  calls: Array<{ text: string; values: unknown[] }> = [];
  constructor(private readonly responses: Array<{ rows?: any[] } | Error>) {}

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const response = this.responses.shift() ?? { rows: [] };
    if (response instanceof Error) throw response;
    return { rows: response.rows ?? [] };
  }
}

test("rejects deletion when a person is linked to an account", async () => {
  const db = new ScriptedDatabase([{ rows: [{ id: 2, username: "ALICE" }] }]);
  const service = createPeopleAdminService(db as any);

  await assert.rejects(
    () => service.deleteAdminPerson(12),
    (error: unknown) => error instanceof PeopleAdminError
      && error.statusCode === 409
      && error.code === "PERSON_LINKED_TO_USER"
      && error.details.assignedUsername === "ALICE"
  );
  assert.equal(db.calls.some((call) => /^DELETE FROM issue_people/i.test(call.text.trim())), false);
});

test("deletes an existing unlinked person", async () => {
  const db = new ScriptedDatabase([{ rows: [] }, { rows: [{ id: 12 }] }]);
  const service = createPeopleAdminService(db as any);

  await service.deleteAdminPerson(12);

  assert.ok(db.calls.some((call) => /DELETE FROM issue_people/i.test(call.text)));
});

test("rejects a missing person and translates a deletion race", async () => {
  const missingDb = new ScriptedDatabase([{ rows: [] }, { rows: [] }]);
  await assert.rejects(
    () => createPeopleAdminService(missingDb as any).deleteAdminPerson(99),
    (error: unknown) => error instanceof PeopleAdminError && error.statusCode === 404
  );

  const race = Object.assign(new Error("foreign key"), { code: "23503" });
  const raceDb = new ScriptedDatabase([{ rows: [] }, race]);
  await assert.rejects(
    () => createPeopleAdminService(raceDb as any).deleteAdminPerson(12),
    (error: unknown) => error instanceof PeopleAdminError
      && error.statusCode === 409
      && error.code === "PERSON_LINKED_TO_USER"
  );
});
