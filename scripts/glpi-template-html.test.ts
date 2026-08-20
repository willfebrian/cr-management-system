import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownTemplate } from "../src/server/utils/namingPattern.js";

test("renders the GLPI ticket template as clean editor-compatible HTML", () => {
  const template = `Dear All,

Issue and CR **CREATED**.

- Issue no: **{ISSUE_KEY}** ({ISSUE_NAME})
- CR no.: **{CR_SAP}**
- CR Description: **{CR_DESCRIPTION}**
- SAP Object List:
{OBJECT_LIST}

**Note:**
Mohon dibantu melengkapi kelengkapan dokumen sebagai berikut:
1. Dokumen CR User
2. No. CR User

Terima kasih.

Regards,

<u>**{FULLNAME}**</u>
**({USER_DEPARTMENT})**`;
  const objectListHtml = '<ul class="template-paragraph-list level-0"><li>Program<ul><li><strong>ZMMF_UNG_PO_IMPORT_PDF</strong></li><li><strong>ZMMF_UNG_PO_LOCAL_PDF</strong></li></ul></li><li>Smart Form<ul><li><strong>ZMMF_UNG_PO_IMPORT_PDF</strong></li><li><strong>ZMMF_UNG_PO_LOCAL_PDF</strong></li></ul></li></ul>';

  const result = renderMarkdownTemplate(template, {
    ISSUE_KEY: "26048-01",
    ISSUE_NAME: "Enhancement Program for PI/PO TTD UNS",
    CR_SAP: "TRDK924756",
    CR_DESCRIPTION: "AB - Enhancement Program for Print PI/PO TTD UNS",
    OBJECT_LIST: "Program\nZMMF_UNG_PO_IMPORT_PDF\nZMMF_UNG_PO_LOCAL_PDF\n\nSmart Form\nZMMF_UNG_PO_IMPORT_PDF\nZMMF_UNG_PO_LOCAL_PDF",
    FULLNAME: "William Febrian Piktono",
    USER_DEPARTMENT: "IT"
  }, objectListHtml, { htmlProfile: "glpi" });

  assert.equal(result.bodyHtml, `<p>Dear All,</p>
<div>&nbsp;</div>
<p>Issue and CR <strong>CREATED</strong>.</p>
<div>&nbsp;</div>
<ul>
<li>Issue no: <strong>26048-01</strong> (Enhancement Program for PI/PO TTD UNS)</li>
<li>CR no.: <strong>TRDK924756</strong></li>
<li>CR Description: <strong>AB - Enhancement Program for Print PI/PO TTD UNS</strong></li>
<li>SAP Object List:${objectListHtml}</li>
</ul>
<div>&nbsp;</div>
<p><strong>Note:</strong></p>
<p>Mohon dibantu melengkapi kelengkapan dokumen sebagai berikut:</p>
<ol>
<li>Dokumen CR User</li>
<li>No. CR User</li>
</ol>
<div>&nbsp;</div>
<p>Terima kasih.</p>
<div>&nbsp;</div>
<p>Regards,</p>
<div>&nbsp;</div>
<p><u><strong>William Febrian Piktono</strong></u></p>
<p><strong>(IT)</strong></p>`);
});

test("keeps the existing styled HTML profile for non-GLPI templates", () => {
  const result = renderMarkdownTemplate("Hello **User**.", {});

  assert.equal(result.bodyHtml, '<p style="margin: 4px 0; line-height: 1.5;">Hello <b>User</b>.</p>');
});
