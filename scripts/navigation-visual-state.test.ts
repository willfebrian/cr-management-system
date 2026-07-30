import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextExpandedSidebarGroup } from "../src/client/navigation";

test("opens only the requested sidebar group", () => {
  assert.equal(nextExpandedSidebarGroup("project", "issue"), "issue");
  assert.equal(nextExpandedSidebarGroup("issue", "project"), "project");
});

test("collapses the currently open sidebar group", () => {
  assert.equal(nextExpandedSidebarGroup("issue", "issue"), null);
  assert.equal(nextExpandedSidebarGroup("project", "project"), null);
});

test("uses semantic responsive header classes", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

  assert.match(app, /className="page-identity"/);
  assert.match(app, /page-sync-toolbar/);
  assert.match(styles, /\.page-identity\s*\{/);
  assert.match(styles, /\.page-sync-toolbar\s*\{/);
});
