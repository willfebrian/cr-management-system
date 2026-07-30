import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/client/styles.css", import.meta.url), "utf8");

for (const token of [
  "--font-size-page-title: 24px",
  "--font-size-section-title: 20px",
  "--font-size-card-title: 18px",
  "--font-size-body: 14px",
  "--font-size-control: 14px",
  "--font-size-label: 12px"
]) {
  assert.match(styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing typography token: ${token}`);
}

assert.match(styles, /body\s*\{[^}]*font-size:\s*var\(--font-size-body\)[^}]*line-height:\s*1\.4/is);
assert.match(styles, /\.sidebar button\s*\{[^}]*font-size:\s*15px/is);
assert.match(styles, /\.sidebar-submenu button\s*\{[^}]*font-size:\s*14px/is);
assert.match(styles, /\.panel-heading h2\s*\{[^}]*font-size:\s*var\(--font-size-card-title\)/is);
assert.match(styles, /\.detail-heading h2\s*\{[^}]*font-size:\s*var\(--font-size-section-title\)/is);
assert.match(styles, /\.issue-initiation-column input[\s\S]*?font-size:\s*var\(--font-size-control\)/is);
assert.match(styles, /\.phase-pair-grid input[\s\S]*?font-size:\s*var\(--font-size-control\)/is);

assert.match(styles, /\.template-preview-modal pre\s*\{[^}]*font-family:\s*Consolas/is, "Generated plain-text previews must retain monospace formatting");
assert.match(styles, /\.template-preview-body\s*\{[^}]*font-family:\s*Arial/is, "Generated HTML previews must retain their template font");

console.log("Typography scale and generated-template font exceptions are preserved.");
