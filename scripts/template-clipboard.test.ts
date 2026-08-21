import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateClipboardPayload } from "../src/client/templateClipboard.js";

test("builds Outlook-compatible clipboard HTML with stable Calibri sizing and compact spacing", () => {
  const payload = buildTemplateClipboardPayload({
    body: "Dear All,\n\nIssue and CR CREATED.",
    bodyHtml: `<p style="margin: 4px 0; line-height: 1.5;">Dear All,</p>
<div>&nbsp;</div>
<ul class="template-paragraph-list level-0"><li>Issue no: <strong>26048-01</strong><ul><li>Program</li><li>Nested<ul><li>Third level</li></ul></li></ul></li></ul>
<ol><li>Dokumen CR User</li></ol>`
  });

  assert.equal(payload.text, "Dear All,\n\nIssue and CR CREATED.");
  assert.match(payload.html || "", /^<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;/);
  assert.match(payload.html || "", /<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;margin:0;padding:0;">Dear All,<\/p>/);
  assert.match(payload.html || "", /<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;height:14pt;margin:0;padding:0;">&nbsp;<\/div>/);
  assert.doesNotMatch(payload.html || "", /line-height:8pt|height:8pt/);
  assert.match(payload.html || "", /<ul class="template-paragraph-list level-0" type="disc" style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;margin:0 0 0 24pt;padding:0;list-style-position:outside;list-style-type:disc;">/);
  assert.match(payload.html || "", /<ul type="circle"[^>]*list-style-type:circle;/);
  assert.match(payload.html || "", /<ul type="square"[^>]*list-style-type:square;/);
  assert.match(payload.html || "", /<ol type="1"[^>]*list-style-type:decimal;/);
  assert.match(payload.html || "", /<li style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;margin:0;padding:0;">/);
  assert.doesNotMatch(payload.html || "", /padding-left:24pt/);
  assert.doesNotMatch(payload.html || "", /Times New Roman/i);
  assert.doesNotMatch(payload.html || "", /line-height:\s*1\.5/);
});

test("keeps plain text available when a template has no HTML body", () => {
  assert.deepEqual(buildTemplateClipboardPayload({ body: "Plain template" }), {
    text: "Plain template"
  });
});
