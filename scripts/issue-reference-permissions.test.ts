import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("each Issue reference grant authorizes only its own category", () => {
  const grants = ["issue.cr_references", "issue.glpi_references", "issue.helpdesk_references"] as const;
  const fields = ["crLinks", "glpiTickets", "crHelpdeskNumbers"] as const;
  const values = ["DEVK900002", "456", "HD-2"] as const;
  for (let grantIndex = 0; grantIndex < grants.length; grantIndex++) {
    const actor = { ...admin, permissions: [grants[grantIndex]] };
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
      const payload = { [fields[fieldIndex]]: values[fieldIndex] };
      if (grantIndex === fieldIndex) assert.doesNotThrow(() => assertIssueReferenceChangesAllowed(payload, stored, actor));
      else assert.throws(() => assertIssueReferenceChangesAllowed(payload, stored, actor), PermissionDeniedError);
    }
  }
});

test("Issue save checks the locked reference sets before mutation and rolls back denials", () => {
  const source = readFileSync(new URL("../src/server/db/issueRepository.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function saveIssue");
  const end = source.indexOf("export async function cancelIssue", start);
  const save = source.slice(start, end);
  const locked = save.indexOf("FOR UPDATE");
  const authorization = save.indexOf("assertIssueReferenceChangesAllowed(payload, storedReferences, actor)");
  const headerMutation = save.indexOf("UPDATE issue_headers");
  assert.ok(locked >= 0 && authorization > locked && headerMutation > authorization);
  for (const replacement of ["replaceGlpiTickets", "replaceCrHelpdeskNumbers", "replaceCrLinks"]) {
    assert.match(save, new RegExp(`if \\(payload\\.[A-Za-z]+ !== undefined\\) await ${replacement}`));
  }
  assert.match(save, /await client\.query\("ROLLBACK"\)/);
});
