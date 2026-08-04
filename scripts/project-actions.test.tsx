import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canConfirmProjectDelete,
  ProjectActions,
  readinessItemToIncompleteItem,
  validateProjectCancelReason
} from "../src/client/components/projects/ProjectActions.js";

const project = {
  id: 2, projectNo: 26002, projectKey: "PRJ-26002", projectName: "Core Upgrade",
  ownerPersonId: 7, ownerName: "Rina", projectStatus: "planned" as const, canDelete: false, issueCount: 0,
  createdBy: "ADMIN", createdAt: "2026-07-01", updatedBy: "USER1", updatedAt: "2026-07-31"
};

test("collapses active Project actions behind an ellipsis trigger", () => {
  const userMarkup = renderToStaticMarkup(<ProjectActions
    project={project}
    userRole="USER"
    onChange={() => undefined}
    onChanged={() => undefined}
  />);
  assert.match(userMarkup, /aria-label="Project actions"/);
  assert.match(userMarkup, /aria-haspopup="menu"/);
  assert.match(userMarkup, /aria-expanded="false"/);
  assert.doesNotMatch(userMarkup, />Change Project</);
  assert.doesNotMatch(userMarkup, />Generate CR Transport</);
  assert.doesNotMatch(userMarkup, />Cancel Project</);

  const adminMarkup = renderToStaticMarkup(<ProjectActions
    project={project}
    userRole="ADMIN"
    onChange={() => undefined}
    onChanged={() => undefined}
  />);
  assert.match(adminMarkup, /aria-label="Project actions"/);
  assert.doesNotMatch(adminMarkup, />Delete Project</);
});

test("requires a cancel reason and exact Project key for delete confirmation", () => {
  assert.match(validateProjectCancelReason(" ") || "", /reason/i);
  assert.equal(validateProjectCancelReason("No budget"), null);
  assert.equal(canConfirmProjectDelete("PRJ-26002", "PRJ-26002"), true);
  assert.equal(canConfirmProjectDelete("prj-26002", "PRJ-26002"), false);
});

test("maps readiness items to the exact Issue editor navigation target", () => {
  assert.deepEqual(readinessItemToIncompleteItem({
    id: "qa-tested",
    label: "QA Tested Date",
    section: "qa",
    issueId: 22,
    issueKey: "26022-01",
    targetId: "issue-qa-testing-date"
  }), {
    id: "qa-tested",
    label: "QA Tested Date",
    section: "qa",
    targetId: "issue-qa-testing-date"
  });
});

test("keeps cancelled Project actions collapsed and preserves read-only context", () => {
  const latestCancelled = { ...project, projectStatus: "cancelled" as const, canDelete: true };
  const olderCancelled = { ...project, projectStatus: "cancelled" as const, canDelete: false };

  const adminLatestMarkup = renderToStaticMarkup(<ProjectActions
    project={latestCancelled}
    userRole="ADMIN"
    onChanged={() => undefined}
  />);
  assert.match(adminLatestMarkup, /aria-label="Project actions"/);
  assert.doesNotMatch(adminLatestMarkup, />Delete Project</);
  assert.doesNotMatch(adminLatestMarkup, /Cancel Project/);
  assert.doesNotMatch(adminLatestMarkup, /read-only/);

  const adminOlderMarkup = renderToStaticMarkup(<ProjectActions
    project={olderCancelled}
    userRole="ADMIN"
    onChanged={() => undefined}
  />);
  assert.doesNotMatch(adminOlderMarkup, /Delete Project/);
  assert.match(adminOlderMarkup, /read-only/);

  const userLatestMarkup = renderToStaticMarkup(<ProjectActions
    project={latestCancelled}
    userRole="USER"
    onChanged={() => undefined}
  />);
  assert.doesNotMatch(userLatestMarkup, /Delete Project/);
  assert.match(userLatestMarkup, /read-only/);
});
