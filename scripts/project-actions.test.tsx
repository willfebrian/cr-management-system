import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canConfirmProjectDelete,
  ProjectActions,
  validateProjectCancelReason
} from "../src/client/components/projects/ProjectActions.js";

const project = {
  id: 2, projectNo: 26002, projectKey: "PRJ-26002", projectName: "Core Upgrade",
  ownerPersonId: 7, ownerName: "Rina", projectStatus: "planned" as const, issueCount: 0,
  createdBy: "ADMIN", createdAt: "2026-07-01", updatedBy: "USER1", updatedAt: "2026-07-31"
};

test("shows cancel to USER and ADMIN but delete only to ADMIN, with no Generate action", () => {
  const userMarkup = renderToStaticMarkup(<ProjectActions
    project={project}
    userRole="USER"
    onChanged={() => undefined}
  />);
  assert.match(userMarkup, /Cancel Project/);
  assert.doesNotMatch(userMarkup, /Delete Project/);
  assert.doesNotMatch(userMarkup, /Generate/);

  const adminMarkup = renderToStaticMarkup(<ProjectActions
    project={project}
    userRole="ADMIN"
    onChanged={() => undefined}
  />);
  assert.match(adminMarkup, /Cancel Project/);
  assert.match(adminMarkup, /Delete Project/);
  assert.doesNotMatch(adminMarkup, /Generate/);
});

test("requires a cancel reason and exact Project key for delete confirmation", () => {
  assert.match(validateProjectCancelReason(" ") || "", /reason/i);
  assert.equal(validateProjectCancelReason("No budget"), null);
  assert.equal(canConfirmProjectDelete("PRJ-26002", "PRJ-26002"), true);
  assert.equal(canConfirmProjectDelete("prj-26002", "PRJ-26002"), false);
});
