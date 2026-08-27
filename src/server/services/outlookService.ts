import { pool } from "../db/pool.js";
import { parseMcpEmailConfig } from "./mcpEmailConfig.js";
import {
  discoverMcpEmailServer,
  searchMcpEmails,
  sendMcpEmail,
  type McpEmailSendInput,
  type McpEmailSendResult,
  type OutlookEmailMatch
} from "./mcpEmailService.js";

export type { OutlookEmailMatch } from "./mcpEmailService.js";

type OutlookSettings = Record<string, string>;

type OutlookMcpDependencies = {
  loadSettings?: () => Promise<OutlookSettings>;
  fetchImpl?: typeof fetch;
};

async function loadOutlookSettings(): Promise<OutlookSettings> {
  const { rows } = await pool.query<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value
     FROM app_settings
     WHERE setting_key IN ('outlook_mcp_config', 'outlook_max_email_count', 'outlook_max_body_chars')`
  );
  return rows.reduce((settings, row) => {
    settings[row.setting_key] = row.setting_value;
    return settings;
  }, {} as OutlookSettings);
}

function positiveInteger(value: number | undefined, configured: string | undefined, fallback: number) {
  const candidate = value ?? Number.parseInt(configured || "", 10);
  return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : fallback;
}

export async function searchConfiguredMcpEmails(
  querySubject: string,
  limit?: number,
  maxChars?: number,
  dependencies: OutlookMcpDependencies = {}
): Promise<OutlookEmailMatch[]> {
  if (!querySubject?.trim()) return [];
  const settings = await (dependencies.loadSettings || loadOutlookSettings)();
  const rawConfig = settings.outlook_mcp_config;
  if (!rawConfig?.trim()) {
    throw new Error("MCP Email is not configured. Configure it in Settings > General Settings.");
  }

  return searchMcpEmails(parseMcpEmailConfig(rawConfig), querySubject, {
    maxResults: positiveInteger(limit, settings.outlook_max_email_count, 5),
    maxBodyChars: positiveInteger(maxChars, settings.outlook_max_body_chars, 15000),
    fetchImpl: dependencies.fetchImpl
  });
}

export async function searchOutlookEmails(
  querySubject: string,
  limit?: number,
  maxChars?: number
): Promise<OutlookEmailMatch[]> {
  return searchConfiguredMcpEmails(querySubject, limit, maxChars);
}

export async function sendConfiguredMcpEmail(
  input: McpEmailSendInput,
  dependencies: OutlookMcpDependencies = {}
): Promise<McpEmailSendResult> {
  const settings = await (dependencies.loadSettings || loadOutlookSettings)();
  const rawConfig = settings.outlook_mcp_config;
  if (!rawConfig?.trim()) {
    throw new Error("MCP Email is not configured. Configure it in Settings > General Settings.");
  }
  return sendMcpEmail(parseMcpEmailConfig(rawConfig), input, { fetchImpl: dependencies.fetchImpl });
}

export async function testConfiguredMcpEmail(rawConfig: string, fetchImpl: typeof fetch = fetch) {
  const result = await discoverMcpEmailServer(parseMcpEmailConfig(rawConfig), fetchImpl);
  return {
    ok: true as const,
    serverName: result.server.name,
    tools: result.tools.filter((name) => name === "search_emails" || name === "read_email")
  };
}
