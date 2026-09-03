import assert from "node:assert/strict";
import test from "node:test";

import { composeReminderEmail, normalizeReminderRecipients } from "../src/server/services/issueReminderComposer.js";

test("keeps editable recipients valid, unique, and in their highest-priority field", () => {
  const recipients = normalizeReminderRecipients({
    to: "requester@trst.co.id; abaper@trst.co.id",
    cc: "SAP-ABAP@trst.co.id, requester@trst.co.id",
    bcc: "audit@trst.co.id\nabaper@trst.co.id"
  });

  assert.deepEqual(recipients, {
    to: ["requester@trst.co.id", "abaper@trst.co.id"],
    cc: ["SAP-ABAP@trst.co.id"],
    bcc: ["audit@trst.co.id"]
  });
});

test("builds one Indonesian reminder email with an English header and no signature", () => {
  const rendered = composeReminderEmail({
    greeting: "Dear Budi Purwanto dan Siti Aisyah,",
    issueKey: "26032-01",
    issueName: "Enhancement Program for COA Automation Project",
    crTransport: "TRDK924626",
    crHelpdesk: "-",
    glpiTickets: [{ number: "16327", url: "https://itsm.trst.co.id/front/ticket.form.php?id=16327" }],
    actions: ["cr_not_prd", "progress_update"],
    notes: "Mohon konfirmasi jadwal import."
  });

  assert.match(rendered.previewHtml, /Issue Reminder/);
  assert.match(rendered.previewHtml, /Dear Budi Purwanto dan Siti Aisyah,/);
  assert.match(rendered.previewHtml, /Mohon informasikan rencana import ke PRD/);
  assert.match(rendered.previewHtml, /Mohon sampaikan progres terbaru/);
  assert.match(rendered.previewHtml, /font-family:Calibri,Arial,sans-serif/);
  assert.match(rendered.previewHtml, /Mohon konfirmasi jadwal import\./);
  assert.match(rendered.previewHtml, /This email was sent automatically by the CR Management System\./);
  assert.doesNotMatch(rendered.previewHtml, /Regards|William Febrian/);
  assert.match(rendered.emailText, /Issue Reminder/);
  assert.match(rendered.emailText, /Notes \/ Outstanding/);
});

test("omits Notes / Outstanding entirely when notes are empty", () => {
  const rendered = composeReminderEmail({
    greeting: "Dear All,",
    issueKey: "26016-01",
    issueName: "Update report",
    crTransport: "TRDK924353",
    crHelpdesk: "-",
    glpiTickets: [],
    actions: ["cr_not_prd"],
    notes: ""
  });

  assert.doesNotMatch(rendered.previewHtml, /Notes \/ Outstanding/);
  assert.doesNotMatch(rendered.emailText, /Notes \/ Outstanding/);
});

test("renders the agreed reminder mockup with Outlook-safe fixed-width tables and explicit typography", () => {
  const rendered = composeReminderEmail({
    greeting: "Dear William Febrian Piktono,",
    issueKey: "26016-01",
    issueName: "Update ZEPP009A case add column Umur by finish time",
    crTransport: "TRDK924353",
    crHelpdesk: "-",
    glpiTickets: [{ number: "14618", url: "https://itsm.trst.co.id/front/ticket.form.php?id=14618" }],
    actions: ["cr_not_prd", "progress_update", "information_or_documents"],
    notes: "Issue dan CR masih memerlukan tindak lanjut."
  });

  assert.match(rendered.previewHtml, /^<!doctype html>/i);
  assert.match(rendered.previewHtml, /<table[^>]+role="presentation"[^>]+width="100%"/i);
  assert.match(rendered.previewHtml, /<table[^>]+role="presentation"[^>]+width="680"/i);
  assert.match(rendered.previewHtml, /width:680px;max-width:680px/i);
  assert.match(rendered.previewHtml, /mso-table-lspace:0pt;mso-table-rspace:0pt/i);
  assert.doesNotMatch(rendered.previewHtml, /<ul\b|<li\b/i);

  const tableCells = [...rendered.previewHtml.matchAll(/<td\b([^>]*)>/gi)];
  assert.ok(tableCells.length >= 12);
  for (const [, attributes] of tableCells) {
    assert.match(attributes, /font-family:Calibri,Arial,sans-serif/i);
    assert.match(attributes, /font-size:11pt/i);
  }

  assert.match(rendered.previewHtml, /background:#0f766e/);
  assert.match(rendered.previewHtml, /border-left:4px solid #f59e0b/);
  assert.match(rendered.previewHtml, /background:#f1f5f9/);
  assert.match(rendered.previewHtml, /Notes \/ Outstanding/);
});
