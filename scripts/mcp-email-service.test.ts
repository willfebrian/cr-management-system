import assert from "node:assert/strict";
import test from "node:test";
import { parseMcpEmailConfig } from "../src/server/services/mcpEmailConfig.js";
import {
  discoverMcpEmailServer,
  searchMcpEmails
} from "../src/server/services/mcpEmailService.js";

const config = parseMcpEmailConfig(JSON.stringify({
  mcpServers: {
    mail: {
      type: "http",
      url: "http://mail.example.test/mcp",
      headers: { Authorization: "Bearer test-secret" }
    }
  }
}));

function rpcResponse(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("discovers required email tools without searching the mailbox", async () => {
  const methods: string[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body || "{}"));
    methods.push(request.method);
    if (request.method === "initialize") {
      return rpcResponse({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "mail", version: "1" } });
    }
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (request.method === "tools/list") {
      return rpcResponse({ tools: [{ name: "search_emails" }, { name: "read_email" }] });
    }
    throw new Error(`Unexpected method ${request.method}`);
  };

  const result = await discoverMcpEmailServer(config, fakeFetch);

  assert.equal(result.server.name, "mail");
  assert.deepEqual(result.tools, ["search_emails", "read_email"]);
  assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/list"]);
});

test("searches by subject, reads each message, and truncates the normalized body", async () => {
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body || "{}"));
    if (request.method === "initialize") {
      return rpcResponse({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "mail", version: "1" } });
    }
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (request.method === "tools/list") {
      return rpcResponse({ tools: [{ name: "search_emails" }, { name: "read_email" }] });
    }
    if (request.method === "tools/call") {
      toolCalls.push(request.params);
      if (request.params.name === "search_emails") {
        return rpcResponse({ content: [{ type: "text", text: JSON.stringify({ emails: [{ messageId: "uid:42", subject: "PI/PO change" }] }) }] });
      }
      return rpcResponse({ content: [{ type: "text", text: JSON.stringify({
        messageId: "uid:42",
        receivedAt: "2026-08-25T08:00:00Z",
        from: { name: "Requester One", email: "requester@example.com" },
        to: ["it@example.com"],
        subject: "PI/PO change",
        body: "123456789"
      }) }] });
    }
    throw new Error(`Unexpected method ${request.method}`);
  };

  const rows = await searchMcpEmails(config, "PI/PO change", {
    maxResults: 2,
    maxBodyChars: 5,
    fetchImpl: fakeFetch
  });

  assert.deepEqual(toolCalls, [
    { name: "search_emails", arguments: { query: "PI/PO change", maxResults: 2, unreadOnly: false } },
    { name: "read_email", arguments: { messageId: "uid:42" } }
  ]);
  assert.deepEqual(rows, [{
    receivedAt: "2026-08-25T08:00:00Z",
    senderName: "Requester One",
    senderEmail: "requester@example.com",
    to: "it@example.com",
    subject: "PI/PO change",
    body: "12345"
  }]);
});

test("rejects an MCP server that does not expose the required email tools", async () => {
  const fakeFetch: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body || "{}"));
    if (request.method === "initialize") return rpcResponse({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "rag", version: "1" } });
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    return rpcResponse({ tools: [{ name: "rag_search" }] });
  };

  await assert.rejects(
    discoverMcpEmailServer(config, fakeFetch),
    /search_emails.*read_email/i
  );
});
