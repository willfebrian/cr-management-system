import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("reminder dialog follows the approved compact composer layout", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");

  assert.match(app, /className="reminder-composer"/);
  assert.match(app, /className="reminder-recipient-grid"/);
  assert.match(app, /className="reminder-action-grid"/);
  assert.match(app, /className="reminder-action-checkbox"/);
  assert.match(app, /className="reminder-notes-heading"/);
  assert.match(app, /Notes \/ Outstanding/);
  assert.match(app, /Draft with AI/);
  assert.doesNotMatch(app, /reportReminder\.preview\.previewHtml/);
  assert.match(app, /!reminderPreview && \(templatePreview\.previewHtml \|\| templatePreview\.bodyHtml\)/);

  assert.match(styles, /\.reminder-action-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(styles, /\.reminder-action-checkbox\s*\{[\s\S]*width:\s*16px/);
  assert.doesNotMatch(styles, /\.reminder-notes-field input\s*\{[\s\S]*width:\s*100%/);
});
