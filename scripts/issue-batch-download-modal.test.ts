import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("opens the shared UI modal before batch download instead of browser confirm", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  assert.match(app, /title: "Download CR Transport Forms\?"/);
  assert.match(app, /confirmText: "Download ZIP"/);
  assert.match(app, /cancelText: "Cancel"/);
  assert.match(app, /Issues selected/);
  assert.match(app, /A single ZIP file will be created using the latest Issue data\./);
  assert.match(app, /batchDownloadModalBody/);
  assert.doesNotMatch(app, /window\.confirm\(`Download CR Transport Form/);
  assert.match(app, /confirmLoading=\{confirmModal\.confirmLoading/);
});
