import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("styles the batch download as the primary action and clear as secondary", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");
  assert.match(app, /className="issue-batch-download"/);
  assert.match(app, /className="secondary issue-batch-clear"/);
  assert.match(styles, /\.issue-batch-download\s*\{[\s\S]*background: var\(--color-primary/);
  assert.match(styles, /\.issue-batch-clear\s*\{[\s\S]*background: var\(--surface-card/);
});
