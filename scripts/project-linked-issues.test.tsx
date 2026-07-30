import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectLinkedIssues, findIssueByKey } from "../src/client/components/ProjectLinkedIssues";
import type { IssueRow } from "../src/shared/types";

const linkedIssues = [
  { id: "26032-01", name: "COA Automation", cr: "TRDK924626", status: "In Progress" },
  { id: "26033-01", name: "Vendor Download", cr: "TRDK924648", status: "Open" }
];

test("renders every linked project issue as a button", () => {
  const markup = renderToStaticMarkup(<ProjectLinkedIssues issues={linkedIssues} onOpenIssue={() => {}} />);

  assert.equal((markup.match(/<button/g) || []).length, 2);
  assert.match(markup, /26032-01/);
  assert.match(markup, /26033-01/);
  assert.equal((markup.match(/lucide-chevron-right/g) || []).length, 2);
});

test("resolves only the exact issue key", () => {
  const rows = [
    { id: 10, issue_key: "26032-02" },
    { id: 11, issue_key: "26032-01" }
  ] as IssueRow[];

  assert.equal(findIssueByKey(rows, "26032-01")?.id, 11);
  assert.equal(findIssueByKey(rows, "26032"), undefined);
});

test("uses the shared summary strip for project metadata", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  assert.match(app, /<SummaryStrip[^>]*className="project-summary-strip"/);
});
