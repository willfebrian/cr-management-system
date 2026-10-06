import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Issue detail uses an assignment sidebar and expandable histories without changing action navigation", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  assert.match(app, /className="issue-detail-split"/);
  assert.match(app, /className="issue-detail-sidebar"/);
  assert.match(app, /<h3>Assignment<\/h3>/);
  assert.match(app, /<details className="issue-detail-history" open>/);
  assert.match(app, /<details className="issue-detail-participants">/);
  assert.match(app, /onCloseDetail\(\); onOpenCr\(link\)/);
  assert.match(app, /onChangeIssue\(selectedIssue.id, item\)/);
});
