import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("exposes a configurable Reminder Email template and styled send preview", () => {
  const settings = readFileSync(new URL("../src/client/pages/MasterDataWorkspace.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/server/services/issueReminderService.ts", import.meta.url), "utf8");
  assert.match(settings, /Reminder Email Template/);
  assert.match(settings, /template_body_reminder/);
  assert.match(app, /Notes \/ Outstanding/);
  assert.match(app, /Send Email/);
  assert.match(app, /preview\.previewHtml/);
  assert.match(service, /template_body_reminder/);
  assert.match(service, /previewHtml/);
});
