import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import {
  createPeopleAdminService,
  PeopleAdminError
} from "../src/server/admin/peopleAdminService";
import { adminRoutes } from "../src/server/routes/adminRoutes";

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

test("rejects person deletion by a non-admin account", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = {
      id: 7,
      username: "REGULAR_USER",
      role: "USER",
      mustChangePassword: false
    };
    next();
  });
  app.use("/api/admin", adminRoutes);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: "unexpected route error" });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/people/12`, {
      method: "DELETE"
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: "Administrator access required" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

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

  const race = Object.assign(new Error("foreign key"), {
    code: "23503",
    constraint: "fk_app_users_person"
  });
  const raceDb = new ScriptedDatabase([
    { rows: [] },
    race,
    { rows: [{ id: 2, username: "ALICE" }] }
  ]);
  await assert.rejects(
    () => createPeopleAdminService(raceDb as any).deleteAdminPerson(12),
    (error: unknown) => error instanceof PeopleAdminError
      && error.statusCode === 409
      && error.code === "PERSON_LINKED_TO_USER"
      && error.details.assignedUserId === 2
      && error.details.assignedUsername === "ALICE"
  );
});

test("does not misreport unrelated foreign-key conflicts as account links", async () => {
  const unrelatedConflict = Object.assign(new Error("requester reference"), {
    code: "23503",
    constraint: "issue_headers_requester_person_id_fkey"
  });
  const db = new ScriptedDatabase([{ rows: [] }, unrelatedConflict]);

  await assert.rejects(
    () => createPeopleAdminService(db as any).deleteAdminPerson(12),
    (error: unknown) => error === unrelatedConflict
  );
});
