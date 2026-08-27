import assert from "node:assert/strict";
import test from "node:test";
import {
  searchConfiguredMcpEmails,
  sendConfiguredMcpEmail,
  testConfiguredMcpEmail
} from "../src/server/services/outlookService.js";

const rawConfig = JSON.stringify({
  mcpServers: {
    mail: { type: "http", url: "http://mail.example.test/mcp", headers: { Authorization: "Bearer test" } }
  }
});

function rpcResponse(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    headers: { "content-type": "application/json" }
  });
}

function emailFetch(): typeof fetch {
  return async (_input, init) => {
    const request = JSON.parse(String(init?.body || "{}"));
    if (request.method === "initialize") return rpcResponse({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "mail", version: "1" } });
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (request.method === "tools/list") return rpcResponse({ tools: [{ name: "search_emails" }, { name: "read_email" }] });
    if (request.params.name === "search_emails") {
      return rpcResponse({ content: [{ type: "text", text: JSON.stringify([{ messageId: "uid:1" }]) }] });
    }
    return rpcResponse({ content: [{ type: "text", text: JSON.stringify({
      messageId: "uid:1", receivedAt: "2026-08-26", senderName: "A", senderEmail: "a@example.com",
      to: "it@example.com", subject: "Target subject", body: "abcdef"
    }) }] });
  };
}

test("uses stored MCP and limit settings for Outlook email extraction", async () => {
  const rows = await searchConfiguredMcpEmails("Target subject", undefined, undefined, {
    loadSettings: async () => ({
      outlook_mcp_config: rawConfig,
      outlook_max_email_count: "2",
      outlook_max_body_chars: "4"
    }),
    fetchImpl: emailFetch()
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, "abcd");
});

test("connection testing discovers tools without requiring saved configuration", async () => {
  const result = await testConfiguredMcpEmail(rawConfig, emailFetch());

  assert.deepEqual(result, {
    ok: true,
    serverName: "mail",
    tools: ["search_emails", "read_email"]
  });
});

test("reports a missing MCP Email configuration", async () => {
  await assert.rejects(
    searchConfiguredMcpEmails("Target subject", 2, 1000, {
      loadSettings: async () => ({}),
      fetchImpl: emailFetch()
    }),
    /MCP Email is not configured/i
  );
});

test("uses the configured MCP Email server to send a reminder", async () => {
  const result = await sendConfiguredMcpEmail({ to: "requester@example.test", subject: "Reminder", body: "Outstanding" }, {
    loadSettings: async () => ({ outlook_mcp_config: rawConfig }),
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body || "{}"));
      if (request.method === "initialize") return rpcResponse({});
      if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (request.method === "tools/list") return rpcResponse({ tools: [{ name: "send_email" }] });
      return rpcResponse({ content: [{ type: "text", text: JSON.stringify({ status: "sent", messageId: "message-99" }) }] });
    }
  });
  assert.equal(result.messageId, "message-99");
});
