import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferenceLookupTrigger,
  canonicalizeAiParticipantName,
  createIssueAiFieldPolicy,
  findExactCrValueHelpRow,
  hasBlockingIssueDialog
} from "../src/client/issueAiFormPolicy.js";

test("does not allow AI to update participant or timeline fields from disabled phases", () => {
  const policy = createIssueAiFieldPolicy({
    formDisabled: false,
    devDisabled: true,
    qaDisabled: true,
    prdRequestDisabled: true,
    prdTransportDisabled: true
  });

  assert.equal(policy.canUpdateParticipant("requester"), true);
  assert.equal(policy.canUpdateParticipant("dev_evaluator"), false);
  assert.equal(policy.canUpdateParticipant("qa_tester"), false);
  assert.equal(policy.canUpdateParticipant("approval"), false);
  assert.equal(policy.canUpdateParticipant("executor"), false);
  assert.equal(policy.canUpdateTimeline("dev_tested_date"), false);
  assert.equal(policy.canUpdateTimeline("qa_evaluated_date"), false);
  assert.equal(policy.canUpdateTimeline("approval_date"), false);
});

test("does not allow AI to update core fields when the entire form is disabled", () => {
  const policy = createIssueAiFieldPolicy({
    formDisabled: true,
    devDisabled: true,
    qaDisabled: true,
    prdRequestDisabled: true,
    prdTransportDisabled: true
  });

  assert.equal(policy.canUpdateCoreField(), false);
  assert.equal(policy.canUpdateParticipant("requester"), false);
});

test("uses the canonical full name when AI returns a directory display name or nickname", () => {
  const people = [{
    full_name: "Alfa Nur Fitriana Islami",
    nickname: "Alfa",
    is_active: true
  }];

  assert.equal(
    canonicalizeAiParticipantName("Alfa Nur Fitriana Islami (Alfa)", people),
    "Alfa Nur Fitriana Islami"
  );
  assert.equal(canonicalizeAiParticipantName("Alfa", people), "Alfa Nur Fitriana Islami");
});

test("leaves an unknown AI participant value intact", () => {
  assert.equal(canonicalizeAiParticipantName("Unknown Person", []), "Unknown Person");
});

test("treats every issue dialog as blocking for the Save Issue action dock", () => {
  assert.equal(hasBlockingIssueDialog({ missingPeopleCount: 1 }), true);
  assert.equal(hasBlockingIssueDialog({ showAiOverwriteModal: true }), true);
  assert.equal(hasBlockingIssueDialog({ actionDialog: "delete" }), true);
  assert.equal(hasBlockingIssueDialog({ hasTemplatePreview: true }), true);
  assert.equal(hasBlockingIssueDialog({}), false);
});

test("selects only the exact CR number when refreshing an Issue preview", () => {
  const rows = [
    { trkorr: "TRDK924760", description: "Older CR" },
    { trkorr: "TRDK924762", description: "Vendor Evaluation" }
  ];

  assert.deepEqual(findExactCrValueHelpRow("trdk924762", rows), rows[1]);
  assert.equal(findExactCrValueHelpRow("TRDK999999", rows), undefined);
});

test("refreshes reference lookup when Create transitions to a saved Issue", () => {
  assert.notEqual(
    buildReferenceLookupTrigger(["17855"], undefined),
    buildReferenceLookupTrigger(["17855"], 42)
  );
});
