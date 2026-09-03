import assert from "node:assert/strict";
import test from "node:test";

import { formatReminderCrTransports, getDefaultReminderNotes, renderReminderContent } from "../src/server/services/issueReminderTemplate.js";

test("keeps lifecycle status out of the CR_SAP token", () => {
  assert.equal(formatReminderCrTransports([
    { trkorr: "TRDK924762", lifecycle_status: "outstanding" },
    { trkorr: "TRDK924763", lifecycle_status: "in_qa" }
  ]), "TRDK924762, TRDK924763");
});

test("starts reminder notes empty regardless of CR lifecycle status", () => {
  assert.equal(getDefaultReminderNotes("in_prd", "TRDK924353"), "");
  assert.equal(getDefaultReminderNotes("outstanding", "TRDK924353"), "");
});

test("renders edited notes at the NOTES token without adding CR status", () => {
  const rendered = renderReminderContent(
    `Dear All,\n\n- CR Transport: **{CR_SAP}**\n\n**Notes / Outstanding:**\n{NOTES}\n\nRegards,\n\n<u>{FULLNAME}</u>`,
    {
      CR_SAP: "TRDK924762",
      CR_STATUS: "outstanding",
      FULLNAME: "William Febrian Piktono"
    },
    "Please complete the QA evidence."
  );

  assert.match(rendered.body, /Please complete the QA evidence\./);
  assert.doesNotMatch(rendered.body, /outstanding/);
  assert.match(rendered.body, /William Febrian Piktono/);
  assert.match(rendered.previewHtml, /<strong>Notes \/ Outstanding:<\/strong>/);
  assert.match(rendered.previewHtml, /<u>William Febrian Piktono<\/u>/);
  assert.doesNotMatch(rendered.emailText, /\*\*/);
  assert.doesNotMatch(rendered.emailText, /<u>/);
});

test("renders CR status only when the template contains CR_STATUS", () => {
  const rendered = renderReminderContent(
    `CR Transport Status: **{CR_STATUS}**\n\n{NOTES}`,
    { CR_STATUS: "outstanding" },
    "Waiting for transport."
  );

  assert.match(rendered.body, /CR Transport Status: \*\*outstanding\*\*/);
  assert.match(rendered.previewHtml, /<strong>outstanding<\/strong>/);
});

test("renders a wrapped GLPI_LINK token as a valid ticket hyperlink", () => {
  const rendered = renderReminderContent(
    `GLPI: **({GLPI_LINK})**`,
    { GLPI_LINK: "[GLPI #17864](https://itsm.trst.co.id/front/ticket.form.php?id=17864)" },
    "Waiting."
  );

  assert.match(rendered.previewHtml, /href="https:\/\/itsm\.trst\.co\.id\/front\/ticket\.form\.php\?id=17864"/);
  assert.match(rendered.previewHtml, />GLPI #17864<\/a>/);
  assert.doesNotMatch(rendered.previewHtml, /id=17864\)"/);
  assert.match(rendered.emailText, /GLPI #17864: https:\/\/itsm\.trst\.co\.id\/front\/ticket\.form\.php\?id=17864/);
});

test("renders reminder HTML with Calibri and email-safe bullet styling", () => {
  const rendered = renderReminderContent(
    "Dear All,\n\n- Issue No.: **{ISSUE_KEY}**\n- CR No.: **{CR_SAP}**",
    { ISSUE_KEY: "26016-01", CR_SAP: "TRDK924353" },
    "Waiting for PRD."
  );

  assert.match(rendered.previewHtml, /<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;margin:0;padding:0;color:#000000;">/);
  assert.match(rendered.previewHtml, /<ul[^>]*style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;margin:0 0 0 24pt;padding:0;list-style-position:outside;list-style-type:disc;">/);
  assert.match(rendered.previewHtml, /<li style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:14pt;mso-line-height-rule:exactly;margin:0;padding:0;">/);
});
