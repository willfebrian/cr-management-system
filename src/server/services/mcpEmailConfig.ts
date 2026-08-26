export const MCP_AUTHORIZATION_MASK = "Bearer •••••••••••••••";

export type McpEmailServerConfig = {
  name: string;
  type: "http";
  url: string;
  headers: Record<string, string>;
};

export type McpEmailConfig = {
  servers: McpEmailServerConfig[];
};

type RawMcpServer = {
  type?: unknown;
  url?: unknown;
  headers?: unknown;
};

type RawMcpConfig = {
  mcpServers?: Record<string, RawMcpServer>;
};

function parseRawConfig(raw: string): RawMcpConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`MCP configuration must be valid JSON${detail}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP configuration must be a JSON object.");
  }
  return parsed as RawMcpConfig;
}

function stringHeaders(value: unknown, serverName: string): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`MCP server "${serverName}" headers must be a JSON object.`);
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") {
      throw new Error(`MCP server "${serverName}" header "${key}" must be a string.`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

export function parseMcpEmailConfig(raw: string): McpEmailConfig {
  const parsed = parseRawConfig(raw);
  const entries = parsed.mcpServers && typeof parsed.mcpServers === "object"
    ? Object.entries(parsed.mcpServers)
    : [];
  if (!entries.length) {
    throw new Error("MCP configuration must contain at least one server in mcpServers.");
  }

  const servers = entries.map(([name, server]) => {
    if (!server || typeof server !== "object") {
      throw new Error(`MCP server "${name}" must be a JSON object.`);
    }
    if (server.type !== "http") {
      throw new Error(`MCP server "${name}" must use HTTP transport.`);
    }
    if (typeof server.url !== "string" || !server.url.trim()) {
      throw new Error(`MCP server "${name}" must define a URL.`);
    }
    let url: URL;
    try {
      url = new URL(server.url.trim());
    } catch {
      throw new Error(`MCP server "${name}" URL is invalid.`);
    }
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
      throw new Error(`MCP server "${name}" must use an HTTP or HTTPS URL.`);
    }
    return {
      name,
      type: "http" as const,
      url: url.toString(),
      headers: stringHeaders(server.headers, name)
    };
  });

  return { servers };
}

function authorizationEntry(headers: Record<string, unknown> | undefined) {
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === "authorization");
}

export function maskMcpEmailConfig(raw: string): string {
  parseMcpEmailConfig(raw);
  const parsed = parseRawConfig(raw);
  for (const server of Object.values(parsed.mcpServers || {})) {
    if (!server.headers || typeof server.headers !== "object" || Array.isArray(server.headers)) continue;
    const entry = authorizationEntry(server.headers as Record<string, unknown>);
    if (entry) (server.headers as Record<string, unknown>)[entry[0]] = MCP_AUTHORIZATION_MASK;
  }
  return JSON.stringify(parsed, null, 2);
}

export function mergeMaskedMcpEmailConfig(nextRaw: string, storedRaw?: string): string {
  parseMcpEmailConfig(nextRaw);
  const next = parseRawConfig(nextRaw);
  const stored = storedRaw?.trim() ? parseRawConfig(storedRaw) : undefined;

  for (const [name, server] of Object.entries(next.mcpServers || {})) {
    if (!server.headers || typeof server.headers !== "object" || Array.isArray(server.headers)) continue;
    const nextEntry = authorizationEntry(server.headers as Record<string, unknown>);
    if (!nextEntry || nextEntry[1] !== MCP_AUTHORIZATION_MASK) continue;

    const storedServer = stored?.mcpServers?.[name];
    const storedHeaders = storedServer?.headers && typeof storedServer.headers === "object" && !Array.isArray(storedServer.headers)
      ? storedServer.headers as Record<string, unknown>
      : undefined;
    const storedEntry = authorizationEntry(storedHeaders);
    if (!storedEntry || typeof storedEntry[1] !== "string" || storedEntry[1] === MCP_AUTHORIZATION_MASK) {
      throw new Error(`Enter a new Authorization value for MCP server "${name}".`);
    }
    (server.headers as Record<string, unknown>)[nextEntry[0]] = storedEntry[1];
  }

  return JSON.stringify(next, null, 2);
}
