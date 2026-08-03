import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProjectTransition,
  diffIssueLinks,
  validateProjectPayload
} from "../src/server/projects/projectDomain.js";

test("normalizes a valid Project payload and removes duplicate Issue IDs", () => {
  assert.deepEqual(
    validateProjectPayload({
      projectName: "  Core Upgrade  ",
      description: "  July release  ",
      ownerPersonId: 7,
      projectStatus: "planned",
      issueIds: [9, 3, 9]
    }),
    {
      projectName: "Core Upgrade",
      description: "July release",
      ownerPersonId: 7,
      projectStatus: "planned",
      issueIds: [3, 9]
    }
  );
});

test("rejects missing name, owner, invalid status, and direct cancelled saves", () => {
  const base = {
    projectName: "Core Upgrade",
    ownerPersonId: 7,
    projectStatus: "planned",
    issueIds: []
  };
  assert.throws(() => validateProjectPayload({ ...base, projectName: " " }), /name is required/i);
  assert.throws(() => validateProjectPayload({ ...base, ownerPersonId: 0 }), /owner is required/i);
  assert.throws(() => validateProjectPayload({ ...base, projectStatus: "draft" }), /status/i);
  assert.throws(() => validateProjectPayload({ ...base, projectStatus: "cancelled" }), /cancel operation/i);
});

test("returns deterministic added and removed Issue link IDs", () => {
  assert.deepEqual(diffIssueLinks([9, 2, 2, 4], [7, 4, 7, 3]), {
    added: [3, 7],
    removed: [2, 9]
  });
});

test("rejects every edit transition from a cancelled Project", () => {
  assert.throws(() => assertProjectTransition("cancelled", "planned"), /read-only/i);
  assert.doesNotThrow(() => assertProjectTransition("planned", "completed"));
});
