import type { McpEmailConfig, McpEmailServerConfig } from "./mcpEmailConfig.js";

const REQUIRED_EMAIL_TOOLS = ["search_emails", "read_email"] as const;

export type McpEmailConnectionResult = {
  server: McpEmailServerConfig;
  tools: string[];
};

export type OutlookEmailMatch = {
  receivedAt: string;
  senderName: string;
  senderEmail: string;
  to: string;
  subject: string;
  body: string;
};

type JsonRpcResponse = {
  result?: any;
  error?: { code?: number; message?: string };
};

class McpHttpClient {
  private requestId = 0;
  private sessionId = "";

  constructor(
    readonly server: McpEmailServerConfig,
    private readonly fetchImpl: typeof fetch
  ) {}

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "cr-management-system", version: "0.1.0" }
    });
    await this.notify("notifications/initialized", {});
  }

  async request(method: string, params: Record<string, unknown>) {
    const response = await this.post({
      jsonrpc: "2.0",
      id: ++this.requestId,
      method,
      params
    });
    if (response.error) {
      throw new Error(`MCP ${method} failed: ${response.error.message || "Unknown JSON-RPC error"}`);
    }
    return response.result;
  }

  private async notify(method: string, params: Record<string, unknown>) {
    await this.post({ jsonrpc: "2.0", method, params }, false);
  }

  private async post(payload: Record<string, unknown>, expectJson = true): Promise<JsonRpcResponse> {
    const headers: Record<string, string> = {
      ...this.server.headers,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json"
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    let response: Response;
    try {
      response = await this.fetchImpl(this.server.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not connect to MCP server "${this.server.name}": ${message}`);
    }

    const nextSessionId = response.headers.get("mcp-session-id");
    if (nextSessionId) this.sessionId = nextSessionId;
    if (!response.ok) {
      throw new Error(`MCP server "${this.server.name}" returned HTTP ${response.status}.`);
    }
    if (!expectJson || response.status === 202 || response.status === 204) return {};

    const text = await response.text();
    if (!text.trim()) return {};
    try {
      if ((response.headers.get("content-type") || "").includes("text/event-stream")) {
        const dataLines = text.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);
        if (!dataLines.length) throw new Error("No JSON data event received");
        return JSON.parse(dataLines[dataLines.length - 1]);
      }
      return JSON.parse(text);
    } catch {
      throw new Error(`MCP server "${this.server.name}" returned an invalid JSON-RPC response.`);
    }
  }
}

async function connectMcpEmailServer(config: McpEmailConfig, fetchImpl: typeof fetch) {
  const failures: string[] = [];
  for (const server of config.servers) {
    try {
      const client = new McpHttpClient(server, fetchImpl);
      await client.initialize();
      const list = await client.request("tools/list", {});
      const tools = Array.isArray(list?.tools)
        ? list.tools.map((tool: any) => String(tool?.name || "")).filter(Boolean)
        : [];
      const missing = REQUIRED_EMAIL_TOOLS.filter((name) => !tools.includes(name));
      if (missing.length) {
        failures.push(`${server.name}: missing ${missing.join(", ")}`);
        continue;
      }
      return { client, server, tools };
    } catch (error) {
      failures.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No configured MCP server exposes search_emails and read_email. ${failures.join("; ")}`);
}

export async function discoverMcpEmailServer(
  config: McpEmailConfig,
  fetchImpl: typeof fetch = fetch
): Promise<McpEmailConnectionResult> {
  const { server, tools } = await connectMcpEmailServer(config, fetchImpl);
  return { server, tools };
}

function toolPayload(result: any, toolName: string): any {
  if (result?.isError) {
    const message = result?.content?.find((entry: any) => entry?.type === "text")?.text;
    throw new Error(`MCP tool ${toolName} failed${message ? `: ${message}` : "."}`);
  }
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const text = result?.content?.find((entry: any) => entry?.type === "text")?.text;
  if (typeof text !== "string") {
    throw new Error(`MCP tool ${toolName} did not return JSON content.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MCP tool ${toolName} returned invalid JSON content.`);
  }
}

function searchRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["emails", "rows", "results", "messages"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function messageId(row: any): string {
  const value = row?.messageId ?? row?.message_id ?? row?.id ?? row?.uid;
  return value === undefined || value === null ? "" : String(value);
}

function stringValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return stringValue(candidate.email ?? candidate.address ?? candidate.name ?? "");
  }
  return value === undefined || value === null ? "" : String(value);
}

function normalizeEmail(payload: any, maxBodyChars: number): OutlookEmailMatch {
  const email = payload?.email && typeof payload.email === "object" ? payload.email : payload;
  if (!email || typeof email !== "object") {
    throw new Error("MCP read_email returned an invalid email object.");
  }
  const from = email.from;
  const senderName = stringValue(email.senderName ?? email.sender_name ?? from?.name);
  const senderEmail = stringValue(email.senderEmail ?? email.sender_email ?? from?.email ?? from?.address ?? (typeof from === "string" ? from : ""));
  const body = stringValue(email.body ?? email.text ?? email.content);
  return {
    receivedAt: stringValue(email.receivedAt ?? email.received_at ?? email.date ?? email.receivedDate),
    senderName,
    senderEmail,
    to: stringValue(email.to ?? email.recipients),
    subject: stringValue(email.subject),
    body: body.slice(0, maxBodyChars)
  };
}

export async function searchMcpEmails(
  config: McpEmailConfig,
  subject: string,
  options: {
    maxResults: number;
    maxBodyChars: number;
    fetchImpl?: typeof fetch;
  }
): Promise<OutlookEmailMatch[]> {
  if (!subject.trim()) return [];
  const { client } = await connectMcpEmailServer(config, options.fetchImpl || fetch);
  const searchResult = await client.request("tools/call", {
    name: "search_emails",
    arguments: { query: subject.trim(), maxResults: options.maxResults, unreadOnly: false }
  });
  const summaries = searchRows(toolPayload(searchResult, "search_emails"));
  const ids = summaries.map(messageId).filter(Boolean).slice(0, options.maxResults);
  if (summaries.length && !ids.length) {
    throw new Error("MCP search_emails results did not include messageId values.");
  }

  return Promise.all(ids.map(async (id) => {
    const readResult = await client.request("tools/call", {
      name: "read_email",
      arguments: { messageId: id }
    });
    return normalizeEmail(toolPayload(readResult, "read_email"), options.maxBodyChars);
  }));
}
