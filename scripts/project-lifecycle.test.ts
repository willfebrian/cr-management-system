import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../src/server/db/pool.js";
import {
  cancelProject,
  deleteProject,
  findActiveProjectForIssue,
  ProjectRepositoryError
} from "../src/server/db/projectRepository.js";

const actor = { id: 11, username: "USER1", role: "USER" as const, mustChangePassword: false };

after(async () => {
  await pool.end();
});

test("cancel requires a reason before opening a transaction", async () => {
  await assert.rejects(cancelProject(2, " ", actor), /reason is required/i);
});

test("cancel makes the Project terminal, releases links, and closes immutable history", async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql: compact(sql), params });
      if (/FROM project_headers[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{
          id: 2, project_key: "PRJ-26002", project_name: "Core",
          project_status: "in_progress"
        }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  (pool as any).connect = async () => client;
  (pool as any).query = async (sql: string) => {
    if (/FROM project_headers h/.test(sql)) {
      return { rows: [{
        id: 2, project_no: 26002, project_key: "PRJ-26002", project_name: "Core",
        owner_person_id: 7, owner_name_snapshot: "Rina", project_status: "cancelled",
        issue_count: 0, created_by_snapshot: "ADMIN", created_at: "2026-07-01",
        updated_by_snapshot: "USER1", updated_at: "2026-07-31",
        cancelled_by_snapshot: "USER1", cancelled_at: "2026-07-31", cancelled_reason: "No budget"
      }] };
    }
    if (/FROM project_issue_link_history/.test(sql)) return { rows: [] };
    return { rows: [{ id: 3, from_status: "in_progress", to_status: "cancelled", changed_by_snapshot: "USER1", changed_at: "2026-07-31" }] };
  };
  try {
    const detail = await cancelProject(2, "No budget", actor);
    assert.equal(detail.project.projectStatus, "cancelled");
    assert.ok(calls.some((call) =>
      /UPDATE project_headers/.test(call.sql)
      && call.params.includes("No budget")
      && call.params.includes(11)
    ));
    assert.ok(calls.some((call) =>
      /UPDATE project_issue_link_history/.test(call.sql)
      && /relation_status = 'cancelled'/.test(call.sql)
    ));
    assert.ok(calls.some((call) => /DELETE FROM project_issue_links/.test(call.sql)));
    assert.ok(calls.some((call) => /INSERT INTO project_status_history/.test(call.sql)));
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test("delete preserves snapshots, removes no Issue, and returns the deleted Project ID", async () => {
  const originalConnect = pool.connect;
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(compact(sql));
      if (/FROM project_headers[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{
          id: 2,
          project_no: 26002,
          project_key: "PRJ-26002",
          project_name: "Core",
          project_status: "cancelled"
        }] };
      }
      if (/MAX\(project_no\)/.test(sql)) return { rows: [{ max_project_no: 26002 }] };
      if (/DELETE FROM project_headers/.test(sql)) return { rows: [{ id: 2 }] };
      return { rows: [] };
    },
    release() {}
  };
  (pool as any).connect = async () => client;
  try {
    assert.deepEqual(await deleteProject(2, { ...actor, role: "ADMIN" }), { ok: true, id: 2 });
    assert.ok(calls.some((sql) => /relation_status = 'deleted'/.test(sql)));
    assert.ok(calls.some((sql) => /DELETE FROM project_headers/.test(sql)));
    assert.ok(calls.every((sql) => !/DELETE FROM issue_headers/.test(sql)));
    assert.equal(calls.at(-1), "COMMIT");
  } finally {
    pool.connect = originalConnect;
  }
});

test("delete rejects a non-cancelled Project and an older cancelled Project", async () => {
  const originalConnect = pool.connect;
  const scenarios = [
    { status: "in_progress", projectNo: 26002, highestNo: 26002 },
    { status: "cancelled", projectNo: 26001, highestNo: 26002 }
  ];

  try {
    for (const scenario of scenarios) {
      const calls: string[] = [];
      const client = {
        async query(sql: string) {
          calls.push(compact(sql));
          if (/FROM project_headers[\s\S]*FOR UPDATE/.test(sql)) {
            return { rows: [{
              id: 2,
              project_no: scenario.projectNo,
              project_key: `PRJ-${scenario.projectNo}`,
              project_name: "Core",
              project_status: scenario.status
            }] };
          }
          if (/MAX\(project_no\)/.test(sql)) {
            return { rows: [{ max_project_no: scenario.highestNo }] };
          }
          if (/DELETE FROM project_headers/.test(sql)) return { rows: [{ id: 2 }] };
          return { rows: [] };
        },
        release() {}
      };
      (pool as any).connect = async () => client;

      await assert.rejects(
        deleteProject(2, { ...actor, role: "ADMIN" }),
        (error: unknown) => error instanceof ProjectRepositoryError
          && error.status === 409
          && error.code === "PROJECT_DELETE_NOT_ALLOWED"
      );
      assert.ok(calls.every((sql) => !/DELETE FROM project_headers/.test(sql)));
      assert.equal(calls.at(-1), "ROLLBACK");
    }
  } finally {
    pool.connect = originalConnect;
  }
});

test("finds the owning active Project for the Issue hard-delete guard", async () => {
  const originalQuery = pool.query;
  (pool as any).query = async () => ({
    rows: [{ project_id: 9, project_key: "PRJ-26009", project_name: "Other" }]
  });
  try {
    assert.deepEqual(await findActiveProjectForIssue(3), {
      projectId: 9,
      projectKey: "PRJ-26009",
      projectName: "Other"
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("rejects lifecycle operations for missing Projects with typed 404 errors", async () => {
  const originalConnect = pool.connect;
  const client = {
    async query(sql: string) {
      if (/FROM project_headers/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {}
  };
  (pool as any).connect = async () => client;
  try {
    await assert.rejects(
      cancelProject(404, "Missing", actor),
      (error: unknown) => error instanceof ProjectRepositoryError && error.status === 404
    );
  } finally {
    pool.connect = originalConnect;
  }
});

function compact(sql: string) {
  return sql.trim().replace(/\s+/g, " ");
}
