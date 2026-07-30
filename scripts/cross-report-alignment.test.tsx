import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DisplayNameList, splitDisplayNames } from "../src/client/components/DisplayNameList";

const app = readFileSync(new URL("../src/client/pages/App.tsx", import.meta.url), "utf8");

test("splits comma and semicolon separated display names into stable lines", () => {
  assert.deepEqual(
    splitDisplayNames("Fany Parama Admaja, Fiqih Hidayaturrahman; Indah Rahayuningtias"),
    ["Fany Parama Admaja", "Fiqih Hidayaturrahman", "Indah Rahayuningtias"]
  );
  assert.deepEqual(splitDisplayNames("Budi Purwanto"), ["Budi Purwanto"]);
  assert.deepEqual(splitDisplayNames(""), []);
});

test("renders each display name on its own line with an empty fallback", () => {
  const names = renderToStaticMarkup(<DisplayNameList value="Fany Parama Admaja, Fiqih Hidayaturrahman" />);
  assert.match(names, /class="display-name-list"/);
  assert.equal((names.match(/<span>/g) || []).length, 2);
  assert.match(names, />Fany Parama Admaja</);
  assert.match(names, />Fiqih Hidayaturrahman</);

  const empty = renderToStaticMarkup(<DisplayNameList value="" />);
  assert.match(empty, />-</);
});

test("uses the shared hierarchy in CR and Issue detail", () => {
  assert.match(app, /<SummaryStrip\s+className="cr-summary-strip"/);
  assert.match(app, /label:\s*"Requester",\s*value:\s*<DisplayNameList/);
  assert.match(app, /label:\s*"ABAPer",\s*value:\s*<DisplayNameList/);
  assert.match(app, /className="cr-related-issue-chevron"/);
});
