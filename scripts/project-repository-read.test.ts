import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../src/server/db/pool.js";
import {
  getProjectDetail,
  listProjects,
  searchProjectIssueOptions
} from "../src/server/db/projectRepository.js";

after(async () => {
  await pool.end();
});

test("lists Projects with parameterized filters and pagination metadata", async () => {
  const original = pool.query;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  (pool as any).query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return {
      rows: [{
        id: 2,
        project_no: 26002,
        project_key: "PRJ-26002",
        project_name: "Core Upgrade",
        description: null,
        owner_person_id: 8,
        owner_name_snapshot: "Rina",
        project_status: "in_progress",
        issue_count: 3,
        created_by_snapshot: "ADMIN",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_by_snapshot: "USER1",
        updated_at: "2026-07-02T00:00:00.000Z",
        total_count: 1
      }]
    };
  };
  try {
    const result = await listProjects({ q: "x' OR true --", status: "in_progress", page: 2, pageSize: 10 });
    assert.equal(result.rows[0]?.projectKey, "PRJ-26002");
    assert.equal(result.rows[0]?.issueCount, 3);
    assert.deepEqual({ page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages }, {
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1
    });
    assert.doesNotMatch(calls[0]!.sql, /x' OR true/);
    assert.ok(calls[0]!.params.includes("%X' OR TRUE --%"));
  } finally {
    pool.query = original;
  }
});

test("returns cancelled Project relationship history rather than current links", async () => {
  const original = pool.query;
  (pool as any).query = async (sql: string) => {
    if (/FROM project_headers h/.test(sql)) {
      return { rows: [{
        id: 4, project_no: 26004, project_key: "PRJ-26004", project_name: "Cancelled",
        owner_person_id: 8, owner_name_snapshot: "Rina", project_status: "cancelled",
        issue_count: 0, created_by_snapshot: "ADMIN", created_at: "2026-07-01",
        updated_by_snapshot: "ADMIN", updated_at: "2026-07-03", cancelled_reason: "Duplicate"
      }] };
    }
    if (/FROM project_issue_link_history/.test(sql)) {
      return { rows: [{
        history_id: 12, issue_id: 22, issue_key: "26001-01", issue_name: "Old issue",
        issue_status: "cancelled", relation_status: "cancelled", linked_at: "2026-07-01",
        unlinked_at: "2026-07-03", reason: "Duplicate"
      }] };
    }
    return { rows: [{ id: 5, to_status: "cancelled", changed_by_snapshot: "ADMIN", changed_at: "2026-07-03" }] };
  };
  try {
    const detail = await getProjectDetail(4);
    assert.equal(detail.issues[0]?.relationStatus, "cancelled");
    assert.equal(detail.issues[0]?.issueKey, "26001-01");
    assert.equal(detail.statusHistory[0]?.toStatus, "cancelled");
  } finally {
    pool.query = original;
  }
});

test("marks Issue options unavailable when another active Project owns them", async () => {
  const original = pool.query;
  let capturedParams: unknown[] = [];
  (pool as any).query = async (_sql: string, params: unknown[]) => {
    capturedParams = params;
    return { rows: [{
      issue_id: 3, issue_key: "26003-01", issue_name: "Owned",
      issue_status: "open", requester_name: "Requester", abaper_name: "ABAPer",
      primary_cr: "D01K900001", owning_project_id: 5,
      owning_project_key: "PRJ-26005", owning_project_name: "Other"
    }] };
  };
  try {
    const rows = await searchProjectIssueOptions("D01K", 4);
    assert.equal(rows[0]?.available, false);
    assert.equal(rows[0]?.owningProjectKey, "PRJ-26005");
    assert.deepEqual(capturedParams, ["%D01K%", 4]);
  } finally {
    pool.query = original;
  }
});

test("marks an unlinked cancelled Issue unavailable for new Project selection", async () => {
  const original = pool.query;
  (pool as any).query = async () => ({
    rows: [{
      issue_id: 8, issue_key: "26008-01", issue_name: "Cancelled",
      issue_status: "cancelled", owning_project_id: null
    }]
  });
  try {
    const rows = await searchProjectIssueOptions("Cancelled");
    assert.equal(rows[0]?.available, false);
  } finally {
    pool.query = original;
  }
});
