import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IncompleteGroupCards } from "../src/client/components/IncompleteGroupCards";
import type { IncompleteGroup } from "../src/client/issueIncomplete";

const groups: IncompleteGroup[] = [
  {
    section: "dev",
    title: "DEV Processing",
    items: [
      { id: "dev-tester", label: "DEV Tester", section: "dev", targetId: "issue-dev-tester" },
      { id: "dev-evaluator", label: "DEV Evaluator", section: "dev", targetId: "issue-dev-evaluator" }
    ]
  },
  {
    section: "qa",
    title: "QA Processing",
    items: [
      { id: "qa-tester", label: "QA Tester", section: "qa", targetId: "issue-qa-tester" }
    ]
  }
];

test("renders grouped incomplete items as non-clickable text when no click handler is provided", () => {
  const markup = renderToStaticMarkup(<IncompleteGroupCards groups={groups} />);

  assert.match(markup, /DEV Processing/);
  assert.match(markup, /DEV Tester/);
  assert.match(markup, /DEV Evaluator/);
  assert.match(markup, /QA Processing/);
  assert.doesNotMatch(markup, /<button/);
});

test("renders grouped incomplete items as buttons when navigation is enabled", () => {
  const markup = renderToStaticMarkup(<IncompleteGroupCards groups={groups} onItemClick={() => {}} />);

  assert.equal((markup.match(/<button/g) || []).length, 3);
});
