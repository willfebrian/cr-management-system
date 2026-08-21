import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_ISSUE_COLUMNS,
  IssueColumnMenu,
  OPTIONAL_ISSUE_COLUMNS
} from "../src/client/components/IssueColumnMenu";

test("keeps the report defaults focused on scanning", () => {
  assert.deepEqual(DEFAULT_ISSUE_COLUMNS, ["issue", "name", "abaper", "cr", "status", "completeness"]);
  assert.deepEqual(OPTIONAL_ISSUE_COLUMNS.map((column) => column.key), ["glpi", "crHelpdesk"]);
});

test("renders accessible optional column checkboxes", () => {
  const markup = renderToStaticMarkup(
    <IssueColumnMenu
      open
      visibleColumns={DEFAULT_ISSUE_COLUMNS}
      onOpenChange={() => {}}
      onToggle={() => {}}
    />
  );

  assert.match(markup, /Columns/);
  assert.match(markup, /GLPI/);
  assert.match(markup, /CR Helpdesk/);
  assert.equal((markup.match(/type="checkbox"/g) || []).length, 2);
});

test("uses a controlled dual-pane workspace", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

  assert.match(app, /controlled-dual-pane/);
  assert.match(app, /issue-report-workspace/);
  assert.match(styles, /\.controlled-dual-pane\s*\{/);
  assert.match(styles, /\.issue-report-workspace\s*\{/);
});

test("provides an eligible Issue selection column and batch ZIP download action", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  assert.match(app, /Select eligible Issues/);
  assert.match(app, /Download CR Forms \(.zip\)/);
  assert.match(app, /issue\.issue_status !== "cancelled"/);
  assert.match(app, /Boolean\(issue\.primary_cr\)/);
});
