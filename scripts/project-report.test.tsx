import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectReportView } from "../src/client/components/projects/ProjectReport.js";

const project = {
  id: 2, projectNo: 26002, projectKey: "PRJ-26002", projectName: "Core Upgrade",
  ownerPersonId: 7, ownerName: "Rina", projectStatus: "cancelled" as const, issueCount: 0,
  createdBy: "ADMIN", createdAt: "2026-07-01", updatedBy: "USER1", updatedAt: "2026-07-31",
  cancelledReason: "No budget"
};

test("renders loading, empty, and API error report states", () => {
  assert.match(renderToStaticMarkup(<ProjectReportView state={{ kind: "loading" }} />), /Loading Projects/i);
  assert.match(renderToStaticMarkup(<ProjectReportView state={{ kind: "empty" }} />), /No Projects found/i);
  assert.match(
    renderToStaticMarkup(<ProjectReportView state={{ kind: "error", message: "Network unavailable" }} />),
    /Network unavailable/
  );
});

test("renders selected Project detail and cancelled historical Issue relationships", () => {
  const markup = renderToStaticMarkup(<ProjectReportView state={{
    kind: "ready",
    result: { rows: [project], page: 1, pageSize: 25, total: 1, totalPages: 1 },
    selectedId: 2,
    detail: {
      project,
      issues: [{
        historyId: 9, issueId: 3, issueKey: "26003-01", issueName: "Old Issue",
        issueStatus: "cancelled", relationStatus: "cancelled", reason: "No budget"
      }],
      statusHistory: []
    }
  }} />);
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /Core Upgrade/);
  assert.match(markup, /Old Issue/);
  assert.match(markup, /Historical · cancelled/);
  assert.match(markup, /No budget/);
});

test("places the Project action menu inside the detail header beside the status", () => {
  const markup = renderToStaticMarkup(<ProjectReportView state={{
    kind: "ready",
    result: { rows: [{ ...project, projectStatus: "in_progress" }], page: 1, pageSize: 25, total: 1, totalPages: 1 },
    selectedId: 2,
    detail: { project: { ...project, projectStatus: "in_progress" }, issues: [], statusHistory: [] }
  }} userRole="ADMIN" />);

  const detailHeader = markup.match(/<header class="project-detail-header">([\s\S]*?)<\/header>/)?.[1] || "";
  assert.match(detailHeader, /project-status-in_progress/);
  assert.match(detailHeader, /aria-label="Project actions"/);
});
