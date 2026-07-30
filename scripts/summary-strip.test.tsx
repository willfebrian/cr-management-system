import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SummaryStrip } from "../src/client/components/SummaryStrip";

test("renders metadata as a divider-based summary without nested cards", () => {
  const markup = renderToStaticMarkup(
    <SummaryStrip items={[
      { label: "Requester", value: "Siti Aisyah" },
      { label: "ABAPer", value: "Fany Parama" },
      { label: "GLPI", value: "16760" },
      { label: "Created", value: "7/21/2026" }
    ]} />
  );

  assert.match(markup, /Requester/);
  assert.match(markup, /Siti Aisyah/);
  assert.match(markup, /ABAPer/);
  assert.match(markup, /16760/);
  assert.doesNotMatch(markup, /\bcard\b/);
});
