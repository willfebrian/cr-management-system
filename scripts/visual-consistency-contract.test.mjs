import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/client/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");

for (const token of [
  "--color-primary:",
  "--color-focus-ring:",
  "--surface-page:",
  "--surface-card:",
  "--space-1:",
  "--space-2:",
  "--space-3:",
  "--space-4:",
  "--space-5:",
  "--space-6:",
  "--radius-card:",
  "--action-bar-height:"
]) {
  assert.match(styles, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing visual token: ${token}`);
}

assert.match(styles, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus-ring\)/is);
assert.match(styles, /\.template-preview-modal pre\s*\{[^}]*font-family:\s*Consolas/is);
assert.match(styles, /\.template-preview-body\s*\{[^}]*font-family:\s*Arial/is);
assert.match(app, /className="cr-data-workspace"/);
assert.match(app, /className="filterbar report-filterbar cr-workspace-filterbar"/);
assert.match(styles, /\.cr-data-workspace\s*\{/);
assert.match(styles, /th\s*\{[^}]*position:\s*sticky/is);
assert.doesNotMatch(app, /className="[^"]*cr-row-card/);
assert.match(styles, /\.dashboard-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/is);
assert.match(app, /className="card user-create-card user-form-workspace"/);
assert.match(app, /className="card user-list-card user-table-workspace"/);
assert.match(styles, /@media \(max-width:\s*920px\)\s*\{[\s\S]*?\.issue-report-workspace\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/is);
assert.match(styles, /@media \(max-width:\s*560px\)\s*\{[\s\S]*?\.summary-strip[^}]*grid-template-columns:\s*1fr;/is);
assert.match(styles, /\.project-detail-section\s*\{[^}]*gap:\s*0;/is);
assert.match(styles, /\.project-issue-row\s*\{[^}]*background:\s*transparent;/is);
assert.match(app, /workspaceRef\.current\?\.scrollTo\(\{\s*top:\s*0/);
assert.match(styles, /\.summary-strip-item\s*\{[^}]*align-content:\s*start;[^}]*grid-auto-rows:\s*max-content;/is);
assert.match(styles, /\.incomplete-group-card\s*\{[^}]*border:\s*1px solid var\(--color-border-soft\);[^}]*background:\s*var\(--surface-subtle\);/is);
assert.match(styles, /tr\.selected td:first-child[\s\S]*box-shadow:\s*inset 3px 0 0 var\(--color-primary\)/is);
assert.match(styles, /\.report-detail-section\s*\{[^}]*border-top:\s*1px solid var\(--color-border-soft\)/is);
assert.match(app, /className="project-status-filter"/);
assert.match(app, /aria-label="Project status"/);
assert.match(app, /<ChevronDown[^>]*aria-hidden="true"/);
assert.match(styles, /\.project-status-filter:focus-within\s*\{[^}]*border-color:\s*var\(--color-primary\)/is);
assert.match(styles, /\.project-status-filter select\s*\{[^}]*appearance:\s*none;/is);

console.log("Shared visual tokens and generated-template exceptions are preserved.");
