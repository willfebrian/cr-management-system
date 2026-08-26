import assert from "node:assert/strict";
import test from "node:test";
import {
  maskMcpEmailConfig,
  mergeMaskedMcpEmailConfig,
  parseMcpEmailConfig
} from "../src/server/services/mcpEmailConfig.js";

const realConfig = JSON.stringify({
  mcpServers: {
    "corporate-email": {
      type: "http",
      url: "http://mail.example.internal/mcp",
      headers: { Authorization: "Bearer real-secret", "X-Tenant": "trias" }
    }
  }
});

test("parses a dynamically named HTTP MCP Email server", () => {
  assert.deepEqual(parseMcpEmailConfig(realConfig), {
    servers: [{
      name: "corporate-email",
      type: "http",
      url: "http://mail.example.internal/mcp",
      headers: { Authorization: "Bearer real-secret", "X-Tenant": "trias" }
    }]
  });
});

test("rejects malformed or unsupported MCP configuration", () => {
  assert.throws(() => parseMcpEmailConfig("{invalid"), /valid JSON/i);
  assert.throws(() => parseMcpEmailConfig(JSON.stringify({ mcpServers: {} })), /at least one/i);
  assert.throws(() => parseMcpEmailConfig(JSON.stringify({
    mcpServers: { mail: { type: "stdio", command: "mail-server" } }
  })), /HTTP transport/i);
});

test("masks Authorization values before returning MCP settings to the browser", () => {
  const masked = JSON.parse(maskMcpEmailConfig(realConfig));

  assert.equal(masked.mcpServers["corporate-email"].headers.Authorization, "Bearer •••••••••••••••");
  assert.equal(masked.mcpServers["corporate-email"].headers["X-Tenant"], "trias");
});

test("preserves the stored Authorization secret when saving a masked configuration", () => {
  const masked = maskMcpEmailConfig(realConfig);
  const merged = JSON.parse(mergeMaskedMcpEmailConfig(masked, realConfig));

  assert.equal(merged.mcpServers["corporate-email"].headers.Authorization, "Bearer real-secret");
});

test("accepts a new Authorization secret when an administrator replaces it", () => {
  const changed = JSON.parse(realConfig);
  changed.mcpServers["corporate-email"].headers.Authorization = "Bearer replacement";
  const merged = JSON.parse(mergeMaskedMcpEmailConfig(JSON.stringify(changed), realConfig));

  assert.equal(merged.mcpServers["corporate-email"].headers.Authorization, "Bearer replacement");
});
