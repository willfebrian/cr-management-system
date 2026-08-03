import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../src/server/db/pool.js";
import { ProjectRepositoryError, saveProject } from "../src/server/db/projectRepository.js";

const actor = { id: 11, username: "USER1", role: "USER" as const, mustChangePassword: false };

after(async () => {
  await pool.end();
});

test("creates a numbered Project and writes actor/link/status audit rows in one transaction", async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql: compact(sql), params });
      if (/FROM issue_people/.test(sql)) return { rows: [{ id: 7, owner_name: "Rina" }] };
      if (/FROM issue_headers[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 3, issue_key: "26003-01", issue_name: "Issue", issue_status: "open" }] };
      }
      if (/FROM project_issue_links l[\s\S]*JOIN project_headers/.test(sql)) return { rows: [] };
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      if (/MAX\(project_no/.test(sql)) return { rows: [{ next_project_no: 26001 }] };
      if (/INSERT INTO project_headers/.test(sql)) return { rows: [{ id: 20 }] };
      if (/SELECT issue_id FROM project_issue_links/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {}
  };
  (pool as any).connect = async () => client;
  (pool as any).query = detailQuery({
    id: 20,
    project_no: 26001,
    project_key: "PRJ-26001",
    project_name: "Core Upgrade",
    owner_person_id: 7,
    owner_name_snapshot: "Rina",
    project_status: "planned",
    created_by_snapshot: "USER1",
    created_at: "2026-07-31",
    updated_by_snapshot: "USER1",
    updated_at: "2026-07-31"
  });
  try {
    const detail = await saveProject({
      projectName: "Core Upgrade",
      ownerPersonId: 7,
      projectStatus: "planned",
      issueIds: [3]
    }, actor);
    assert.equal(detail.project.projectKey, "PRJ-26001");
    assert.ok(calls.some((call) => /pg_advisory_xact_lock/.test(call.sql)));
    assert.deepEqual(calls.find((call) => /MAX\(project_no/.test(call.sql))?.params, [26001, 26999]);
    assert.ok(calls.some((call) =>
      /INSERT INTO project_headers/.test(call.sql)
      && call.params.includes("PRJ-26001")
      && call.params.includes(11)
      && call.params.includes("USER1")
    ));
    assert.ok(calls.some((call) => /INSERT INTO project_issue_links/.test(call.sql)));
    assert.ok(calls.some((call) => /INSERT INTO project_issue_link_history/.test(call.sql)));
    assert.ok(calls.some((call) => /INSERT INTO project_status_history/.test(call.sql)));
    assert.equal(calls.at(-1)?.sql, "COMMIT");
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test("rolls back when an Issue is already assigned to another active Project", async () => {
  const originalConnect = pool.connect;
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(compact(sql));
      if (/FROM issue_people/.test(sql)) return { rows: [{ id: 7, owner_name: "Rina" }] };
      if (/FROM issue_headers[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 3, issue_key: "26003-01", issue_name: "Issue", issue_status: "open" }] };
      }
      if (/FROM project_issue_links l[\s\S]*JOIN project_headers/.test(sql)) {
        return { rows: [{ issue_id: 3, project_id: 9, project_key: "PRJ-26009" }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  (pool as any).connect = async () => client;
  try {
    await assert.rejects(
      saveProject({
        projectName: "Core Upgrade",
        ownerPersonId: 7,
        projectStatus: "planned",
        issueIds: [3]
      }, actor),
      (error: unknown) => error instanceof ProjectRepositoryError
        && error.status === 409
        && /PRJ-26009/.test(error.message)
    );
    assert.equal(calls.at(-1), "ROLLBACK");
  } finally {
    pool.connect = originalConnect;
  }
});

test("keeps an already-linked cancelled Issue until Change Project explicitly removes it", async () => {
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(compact(sql));
      if (/FROM project_headers[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 20, project_key: "PRJ-26001", project_name: "Core", project_status: "planned" }] };
      }
      if (/FROM issue_people/.test(sql)) return { rows: [{ id: 7, owner_name: "Rina" }] };
      if (/SELECT issue_id FROM project_issue_links/.test(sql)) return { rows: [{ issue_id: 3 }] };
      if (/FROM issue_headers[\s\S]*FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 3, issue_key: "26003-01", issue_name: "Cancelled Issue", issue_status: "cancelled" }] };
      }
      if (/FROM project_issue_links l[\s\S]*JOIN project_headers/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {}
  };
  (pool as any).connect = async () => client;
  (pool as any).query = detailQuery({
    id: 20,
    project_no: 26001,
    project_key: "PRJ-26001",
    project_name: "Core",
    owner_person_id: 7,
    owner_name_snapshot: "Rina",
    project_status: "planned",
    created_by_snapshot: "USER1",
    created_at: "2026-07-31",
    updated_by_snapshot: "USER1",
    updated_at: "2026-07-31"
  });
  try {
    const result = await saveProject({
      id: 20,
      projectName: "Core",
      ownerPersonId: 7,
      projectStatus: "planned",
      issueIds: [3]
    }, actor);
    assert.equal(result.project.id, 20);
    assert.ok(calls.every((sql) => !/DELETE FROM project_issue_links/.test(sql)));
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

function detailQuery(project: Record<string, unknown>) {
  return async (sql: string) => {
    if (/FROM project_headers h/.test(sql)) return { rows: [{ ...project, issue_count: 1 }] };
    if (/FROM project_issue_links l/.test(sql)) {
      return { rows: [{
        link_id: 1, issue_id: 3, issue_key: "26003-01", issue_name: "Issue",
        issue_status: "open", relation_status: "active", linked_at: "2026-07-31"
      }] };
    }
    return { rows: [{ id: 1, from_status: null, to_status: "planned", changed_by_snapshot: "USER1", changed_at: "2026-07-31" }] };
  };
}

function compact(sql: string) {
  return sql.trim().replace(/\s+/g, " ");
}
