import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

test("keeps editor actions visible without covering the last section", () => {
  assert.match(app, /className="editor-safe-space"/);
  assert.match(css, /\.issue-editor-panel\s*\{[^}]*padding-bottom:\s*calc\(var\(--action-bar-height\)/s);
  assert.match(css, /\.issue-save-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/s);
  assert.match(css, /\.editor-safe-space\s*\{[^}]*min-height:\s*var\(--action-bar-height\)/s);
});

test("keeps Issue Initiation expandable", () => {
  assert.match(app, /togglePhase\("initiation"\)/);
  assert.match(app, /expandedPhases\.initiation/);
});
