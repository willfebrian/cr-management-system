import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareAdminSettingsUpdate,
  sanitizeAdminSettings
} from "../src/server/admin/adminSettingsService.js";

const storedMcpConfig = JSON.stringify({
  mcpServers: {
    mail: {
      type: "http",
      url: "http://mail.example.test/mcp",
      headers: { Authorization: "Bearer stored-secret" }
    }
  }
});

test("sanitizes MCP Authorization without changing ordinary settings", () => {
  const settings = sanitizeAdminSettings({
    outlook_mcp_config: storedMcpConfig,
    outlook_max_email_count: "2"
  });

  assert.equal(settings.outlook_max_email_count, "2");
  assert.equal(
    JSON.parse(settings.outlook_mcp_config).mcpServers.mail.headers.Authorization,
    "Bearer •••••••••••••••"
  );
});

test("prepares masked MCP updates with the stored secret restored", () => {
  const masked = sanitizeAdminSettings({ outlook_mcp_config: storedMcpConfig }).outlook_mcp_config;
  const update = prepareAdminSettingsUpdate(
    { outlook_mcp_config: masked, outlook_max_body_chars: "15000" },
    storedMcpConfig
  );

  assert.equal(
    JSON.parse(update.outlook_mcp_config).mcpServers.mail.headers.Authorization,
    "Bearer stored-secret"
  );
  assert.equal(update.outlook_max_body_chars, "15000");
});

test("rejects a non-string setting value", () => {
  assert.throws(
    () => prepareAdminSettingsUpdate({ outlook_max_email_count: 2 } as unknown as Record<string, string>),
    /must be a string/i
  );
});
