import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReleaseCandidateRow } from "../src/client/api/transportReleaseApi.js";
import { IssueCrTransportRelease } from "../src/client/components/crTransport/IssueCrTransportRelease.js";

function candidate(trkorr: string): ReleaseCandidateRow {
  return {
    trkorr,
    description: `Description ${trkorr}`,
    owner: "",
    statusGroup: "outstanding",
    changedDate: null,
    targetSystem: "DEV_AIX",
    taskCount: 1
  };
}

test("renders the approved Select and Test Run sections and lists every selected CR", () => {
  const html = renderToStaticMarkup(
    <IssueCrTransportRelease
      candidates={[candidate("TRDK924682"), candidate("TRDK924730")]}
      targetLabel="Development AIX · TRD"
    />
  );

  assert.match(html, /<span class="cr-release-step">1<\/span><h3>Select Transport Request<\/h3>/);
  assert.match(html, /<span class="cr-release-step">2<\/span><h3>Test Run<\/h3>/);
  assert.match(html, /TRDK924682/);
  assert.match(html, /TRDK924730/);
  assert.match(html, /Test Run/);
  assert.doesNotMatch(html, /data-issue-release-section="release"/);
});

test("uses a fixed selection without checkboxes when only one linked CR is eligible", () => {
  const html = renderToStaticMarkup(
    <IssueCrTransportRelease
      candidates={[candidate("TRDK924682")]}
      targetLabel="Development AIX · TRD"
    />
  );

  assert.match(html, /TRDK924682/);
  assert.doesNotMatch(html, /type="checkbox"/);
  assert.doesNotMatch(html, /Change Selection/);
});

test("uses content-driven cards so Test Run results are not clipped", () => {
  const html = renderToStaticMarkup(
    <IssueCrTransportRelease
      candidates={[candidate("TRDK924682")]}
      targetLabel="Development AIX · TRD"
    />
  );

  assert.match(html, /class="cr-release-workspace issue-cr-release-workspace issue-cr-release-content-flow"/);
  assert.match(html, /Test Run/);
  assert.doesNotMatch(html, /Run Test Run/);
});

test("keeps the Target System out of the Select Transport Request card", () => {
  const html = renderToStaticMarkup(
    <IssueCrTransportRelease
      candidates={[candidate("TRDK924682")]}
      targetLabel="Development AIX · TRD"
    />
  );

  assert.doesNotMatch(html, /Target System/);
});
