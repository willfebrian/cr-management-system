import assert from "node:assert/strict";
import test from "node:test";
import { assertIssueReferenceChangesAllowed, PermissionDeniedError } from "../src/server/issues/issueReferenceAuthorization";

const stored = { crLinks: ["DEVK900001"], glpiTickets: ["123"], crHelpdeskNumbers: ["HD-1"] };
const user = { role: "USER", permissions: [] } as any;
const admin = { role: "ADMIN", permissions: [] } as any;

for (const [field, grant, next] of [
  ["crLinks", "issue.cr_references", "DEVK900002"],
  ["glpiTickets", "issue.glpi_references", "456"],
  ["crHelpdeskNumbers", "issue.helpdesk_references", "HD-2"]
] as const) {
  test(`${field}: first entry, replacement and removal require its grant`, () => {
    for (const value of [next, ""]) {
      assert.throws(() => assertIssueReferenceChangesAllowed({ [field]: value }, stored, admin), PermissionDeniedError);
      assert.doesNotThrow(() => assertIssueReferenceChangesAllowed({ [field]: value }, stored, { ...admin, permissions: [grant] }));
    }
    assert.throws(() => assertIssueReferenceChangesAllowed({ [field]: next }, { crLinks: [], glpiTickets: [], crHelpdeskNumbers: [] }, admin), PermissionDeniedError);
  });
}

test("unchanged and omitted fields do not need grants", () => {
  assert.doesNotThrow(() => assertIssueReferenceChangesAllowed({}, stored, user));
  assert.doesNotThrow(() => assertIssueReferenceChangesAllowed({ crLinks: "devk900001", glpiTickets: "#123", crHelpdeskNumbers: "hd-1" }, stored, user));
});

test("regular users cannot change SAP or GLPI references even if granted", () => {
  assert.throws(() => assertIssueReferenceChangesAllowed({ crLinks: "DEVK900002" }, stored, { ...user, permissions: ["issue.cr_references"] }), PermissionDeniedError);
  assert.throws(() => assertIssueReferenceChangesAllowed({ glpiTickets: "456" }, stored, { ...user, permissions: ["issue.glpi_references"] }), PermissionDeniedError);
  assert.doesNotThrow(() => assertIssueReferenceChangesAllowed({ crHelpdeskNumbers: "HD-2" }, stored, { ...user, permissions: ["issue.helpdesk_references"] }));
});
