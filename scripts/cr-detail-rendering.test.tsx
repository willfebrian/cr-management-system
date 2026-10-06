import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrDetail } from "../src/shared/types";
import { CrDetailContent } from "../src/client/components/crTransport/CrDetailContent";
import { readFileSync } from "node:fs";

test("places the CR lifecycle badge in the modal title instead of the body", () => {
  const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");
  const modal = app.slice(app.indexOf('title={displayRequest?.trkorr || "CR Detail"}'), app.indexOf("function IssueDisplay("));
  assert.match(modal, /titleBadge=\{displayRequest \? <Status/);
  const content = readFileSync(new URL("../src/client/components/crTransport/CrDetailContent.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(content, /cr-detail-status/);
});

test("renders one object with expandable parent/task provenance, table keys, and separate release entry", () => {
  const detail = {
    request: { trkorr: "P" }, tasks: [], issueLinks: [],
    objects: [
      { trkorr: "P", position: "1", pgmid: "R3TR", object_type: "TABU", object_name: "TFO05" },
      { trkorr: "T", position: "2", pgmid: "R3TR", object_type: "TABU", object_name: "TFO05" },
      { trkorr: "P", position: "3", pgmid: "CORR", object_type: "RELE", object_name: "RELEASE" }
    ], keys: [{ trkorr: "T", position: "2", table_key: "100ABC*" }]
  } as unknown as CrDetail;
  const markup = renderToStaticMarkup(<CrDetailContent detail={detail} metadata={[]} lifecycle={[]} renderStatus={value => <span>{value}</span>} issueStatus={() => ""} taskStatus={() => ""} onOpenIssue={() => {}} />);
  assert.equal((markup.match(/<strong>TFO05<\/strong>/g) || []).length, 1);
  assert.match(markup, /1 unique/);
  assert.match(markup, /2 source records/);
  assert.match(markup, /P · <strong>Request/);
  assert.match(markup, /T · <strong>Task/);
  assert.match(markup, /Table key: 100ABC\*/);
  assert.match(markup, /Release entries · 1 record/);
  assert.match(markup, /<details class="cr-detail-object"/);
});
