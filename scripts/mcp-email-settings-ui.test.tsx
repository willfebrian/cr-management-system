import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  McpEmailSettingsCard,
  validateMcpEmailConfigJson
} from "../src/client/components/settings/McpEmailSettingsCard.js";

const noop = () => {};

test("renders MCP JSON and extraction limits side by side using the Outlook settings card", () => {
  const html = renderToStaticMarkup(<McpEmailSettingsCard
    configJson={'{"mcpServers":{"mail":{"type":"http","url":"http://mail/mcp"}}}'}
    maxEmails="2"
    maxBodyChars="15000"
    validationError=""
    connectionStatus={{ type: "success", message: "Connected — email tools detected" }}
    testing={false}
    onConfigChange={noop}
    onMaxEmailsChange={noop}
    onMaxBodyCharsChange={noop}
    onTestConnection={noop}
  />);

  assert.match(html, /Outlook Mail Extraction Configuration/);
  assert.match(html, /MCP CONFIGURATION \(JSON\)/);
  assert.match(html, /MAXIMUM EMAILS TO FETCH/);
  assert.match(html, /MAXIMUM CHARACTERS PER BODY/);
  assert.match(html, /Test MCP Connection/);
  assert.match(html, /Connected — email tools detected/);
  assert.doesNotMatch(html, /Download|local agent|port 18888/i);
});

test("validates JSON and required MCP HTTP server fields", () => {
  assert.match(validateMcpEmailConfigJson("{invalid") || "", /valid JSON/i);
  assert.match(validateMcpEmailConfigJson('{"mcpServers":{}}') || "", /at least one/i);
  assert.equal(validateMcpEmailConfigJson('{"mcpServers":{"mail":{"type":"http","url":"http://mail/mcp"}}}'), null);
});
