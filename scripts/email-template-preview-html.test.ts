import assert from "node:assert/strict";
import test from "node:test";

test("renders email preview with the GLPI HTML profile without changing clipboard HTML or content", async () => {
  const module = await import("../src/server/templates/issueTemplateService.js");
  const renderCustomIssueTemplate = (module as Record<string, unknown>).renderCustomIssueTemplate;

  assert.equal(typeof renderCustomIssueTemplate, "function", "custom template rendering must expose separate preview HTML");

  const rendered = (renderCustomIssueTemplate as (
    template: string,
    tokens: Record<string, string>,
    objectListHtml: string,
    kind: "email" | "ticket"
  ) => { body: string; bodyHtml: string; previewHtml: string })(
    "Dear All,\n\nEmail **CREATED**.\n\n- Issue no: **{ISSUE_KEY}**",
    { ISSUE_KEY: "26048-01" },
    "",
    "email"
  );

  assert.equal(rendered.body, "Dear All,\n\nEmail CREATED.\n\n- Issue no: 26048-01");
  assert.match(rendered.bodyHtml, /<p style="margin: 4px 0; line-height: 1\.5;">Dear All,<\/p>/);
  assert.match(rendered.bodyHtml, /<b>CREATED<\/b>/);
  assert.equal(rendered.previewHtml, `<p>Dear All,</p>
<div>&nbsp;</div>
<p>Email <strong>CREATED</strong>.</p>
<div>&nbsp;</div>
<ul>
<li>Issue no: <strong>26048-01</strong></li>
</ul>`);
});
