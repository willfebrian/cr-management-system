import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModalAwareActionDock } from "../src/client/components/ModalAwareActionDock.js";
import { runTemplatePreviewAction } from "../src/client/templatePreviewActions.js";

test("makes the issue action dock inert while a template preview is open", () => {
  const markup = renderToStaticMarkup(
    <ModalAwareActionDock modalOpen>
      <button type="button">Save Issue</button>
    </ModalAwareActionDock>
  );

  assert.match(markup, /class="sticky-actions sticky-actions--modal-disabled"/);
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /inert=""/);
});

test("keeps the issue action dock interactive after the template preview closes", () => {
  const markup = renderToStaticMarkup(
    <ModalAwareActionDock modalOpen={false}>
      <button type="button">Save Issue</button>
    </ModalAwareActionDock>
  );

  assert.match(markup, /class="sticky-actions"/);
  assert.doesNotMatch(markup, /aria-disabled/);
  assert.doesNotMatch(markup, /inert=/);
});

test("opens GLPI without copying the template", async () => {
  let copyCount = 0;
  let glpiOpenCount = 0;

  await runTemplatePreviewAction("open-glpi", {
    copy: async () => { copyCount += 1; },
    openGlpi: () => { glpiOpenCount += 1; }
  });

  assert.equal(copyCount, 0);
  assert.equal(glpiOpenCount, 1);
});

test("copies only when the explicit copy action is requested", async () => {
  let copyCount = 0;
  let glpiOpenCount = 0;

  await runTemplatePreviewAction("copy", {
    copy: async () => { copyCount += 1; },
    openGlpi: () => { glpiOpenCount += 1; }
  });

  assert.equal(copyCount, 1);
  assert.equal(glpiOpenCount, 0);
});
