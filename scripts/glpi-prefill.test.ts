import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGlpiPrefillSubmission,
  formatGlpiOpeningDate,
  submitGlpiPrefill
} from "../src/client/glpiPrefill.js";

test("formats the GLPI opening date at local second precision", () => {
  assert.equal(
    formatGlpiOpeningDate(new Date(2026, 7, 20, 15, 46, 13)),
    "2026-08-20 15:46:13"
  );
});

test("builds a GLPI preview GET without the ticket-creation flag", () => {
  const submission = buildGlpiPrefillSubmission({
    title: "Issue no: 26048-01 (Enhancement Program for PI/PO TTD UNS)",
    descriptionHtml: "<p>Dear All,</p><p>Issue and CR CREATED.</p>",
    openedAt: "2026-08-20 15:46:13",
    abaperGlpiUserIds: [88]
  });

  assert.equal(submission.method, "GET");
  assert.equal(submission.target, "_blank");
  assert.deepEqual(submission.fields, {
    name: "Issue no: 26048-01 (Enhancement Program for PI/PO TTD UNS)",
    content: "<p>Dear All,</p><p>Issue and CR CREATED.</p>",
    date: "2026-08-20 15:46:13",
    type: "2",
    itilcategories_id: "121",
    requesttypes_id: "2",
    locations_id: "1",
    _skip_default_actor: "1",
    "_actors[requester][0][itemtype]": "Group",
    "_actors[requester][0][items_id]": "31",
    "_actors[requester][1][itemtype]": "User",
    "_actors[requester][1][items_id]": "88",
    "_actors[requester][1][use_notification]": "1",
    "_actors[observer][0][itemtype]": "Group",
    "_actors[observer][0][items_id]": "31",
    "_actors[observer][1][itemtype]": "Group",
    "_actors[observer][1][items_id]": "40",
    "_actors[assign][0][itemtype]": "User",
    "_actors[assign][0][items_id]": "88",
    "_actors[assign][0][use_notification]": "1"
  });
  assert.equal(Object.hasOwn(submission.fields, "add"), false);
  const url = new URL(submission.url);
  assert.equal(url.origin + url.pathname, "https://itsm.trst.co.id/front/ticket.form.php");
  assert.equal(url.searchParams.get("name"), submission.fields.name);
  assert.equal(url.searchParams.get("content"), submission.fields.content);
  assert.equal(url.searchParams.has("add"), false);
});

test("omits an unavailable ABAPer while keeping the default GLPI groups", () => {
  const submission = buildGlpiPrefillSubmission({
    title: "Issue no: 26048-01 (Example)",
    descriptionHtml: "<p>Template</p>",
    openedAt: "2026-08-20 15:46:13",
    abaperGlpiUserIds: []
  });
  assert.equal(submission.fields["_actors[requester][0][items_id]"], "31");
  assert.equal(submission.fields["_actors[observer][0][items_id]"], "31");
  assert.equal(submission.fields["_actors[observer][1][items_id]"], "40");
  assert.equal(Object.values(submission.fields).includes("User"), false);
});

test("opens the prefill GET in a new tab without posting a form", () => {
  const opened: Array<{ url: string; target: string }> = [];
  const windowLike = {
    open(url: string, target: string) {
      opened.push({ url, target });
    }
  };

  submitGlpiPrefill(windowLike, {
    action: "https://itsm.trst.co.id/front/ticket.form.php",
    method: "GET",
    target: "_blank",
    fields: { name: "Issue no: 26048-01", content: "Template" },
    url: "https://itsm.trst.co.id/front/ticket.form.php?name=Issue+no%3A+26048-01&content=Template"
  });

  assert.deepEqual(opened, [{
    url: "https://itsm.trst.co.id/front/ticket.form.php?name=Issue+no%3A+26048-01&content=Template",
    target: "_blank"
  }]);
});
