import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  addProjectIssueSelection,
  ProjectIssuePicker,
  removeProjectIssueSelection
} from "../src/client/components/projects/ProjectIssuePicker.js";

const available = {
  issueId: 3, issueKey: "26003-01", issueName: "Available",
  issueStatus: "open", available: true
};
const owned = {
  issueId: 4, issueKey: "26004-01", issueName: "Owned",
  issueStatus: "open", available: false,
  owningProjectId: 9, owningProjectKey: "PRJ-26009", owningProjectName: "Other"
};

test("adds unique Issue selections and removes only the requested Issue", () => {
  assert.deepEqual(addProjectIssueSelection([available], available), [available]);
  assert.deepEqual(addProjectIssueSelection([available], { ...available }), [available]);
  assert.deepEqual(removeProjectIssueSelection([available, owned], 3), [owned]);
});

test("labels and disables Issues owned by another active Project", () => {
  const markup = renderToStaticMarkup(<ProjectIssuePicker
    query="260"
    options={[available, owned]}
    selected={[available]}
    loading={false}
    readOnly={false}
    onQueryChange={() => undefined}
    onAdd={() => undefined}
    onRemove={() => undefined}
  />);
  assert.match(markup, /PRJ-26009/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Remove 26003-01/);
});

test("separates search results from selected Issues with stable row actions", () => {
  const markup = renderToStaticMarkup(<ProjectIssuePicker
    query="260"
    options={[available, owned]}
    selected={[available]}
    loading={false}
    readOnly={false}
    onQueryChange={() => undefined}
    onAdd={() => undefined}
    onRemove={() => undefined}
  />);

  assert.match(markup, />Search Results</);
  assert.match(markup, />Selected Issues</);
  assert.match(markup, /class="project-issue-results"/);
  assert.match(markup, /class="project-selected-section"/);
  assert.equal(markup.match(/class="project-issue-action"/g)?.length, 3);
});
