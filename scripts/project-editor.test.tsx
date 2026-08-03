import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createInitialProjectDraft,
  ProjectEditorView,
  validateProjectDraft
} from "../src/client/components/projects/ProjectEditor.js";

test("starts Create Project in planned status and validates owner/name", () => {
  assert.deepEqual(createInitialProjectDraft(), {
    projectName: "",
    description: "",
    ownerPersonId: 0,
    projectStatus: "planned",
    issueIds: []
  });
  assert.match(validateProjectDraft(createInitialProjectDraft()) || "", /name/i);
  assert.match(validateProjectDraft({ ...createInitialProjectDraft(), projectName: "Core" }) || "", /owner/i);
});

test("renders owner/status controls and makes cancelled Projects read-only", () => {
  const draft = {
    id: 2,
    projectName: "Cancelled Core",
    description: "",
    ownerPersonId: 7,
    projectStatus: "planned" as const,
    issueIds: [3]
  };
  const editable = renderToStaticMarkup(<ProjectEditorView
    mode="change"
    draft={draft}
    owners={[{ personId: 7, fullName: "Rina" }]}
    issueOptions={[]}
    selectedIssues={[]}
    issueQuery=""
    saving={false}
    readOnly={false}
    onDraftChange={() => undefined}
    onIssueQueryChange={() => undefined}
    onAddIssue={() => undefined}
    onRemoveIssue={() => undefined}
    onSave={() => undefined}
    onCancel={() => undefined}
  />);
  assert.match(editable, /Project Owner/);
  assert.match(editable, /In Progress/);
  assert.match(editable, /Save Project/);

  const readOnly = renderToStaticMarkup(<ProjectEditorView
    mode="change"
    draft={draft}
    owners={[{ personId: 7, fullName: "Rina" }]}
    issueOptions={[]}
    selectedIssues={[]}
    issueQuery=""
    saving={false}
    readOnly
    onDraftChange={() => undefined}
    onIssueQueryChange={() => undefined}
    onAddIssue={() => undefined}
    onRemoveIssue={() => undefined}
    onSave={() => undefined}
    onCancel={() => undefined}
  />);
  assert.match(readOnly, /Cancelled Projects are read-only/);
  assert.doesNotMatch(readOnly, />Save Project</);
});
