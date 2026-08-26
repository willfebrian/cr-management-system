import { maskMcpEmailConfig, mergeMaskedMcpEmailConfig } from "../services/mcpEmailConfig.js";

export const OUTLOOK_MCP_CONFIG_KEY = "outlook_mcp_config";

export function sanitizeAdminSettings(settings: Record<string, string>): Record<string, string> {
  const sanitized = { ...settings };
  const rawMcpConfig = sanitized[OUTLOOK_MCP_CONFIG_KEY];
  if (rawMcpConfig?.trim()) {
    sanitized[OUTLOOK_MCP_CONFIG_KEY] = maskMcpEmailConfig(rawMcpConfig);
  }
  return sanitized;
}

export function prepareAdminSettingsUpdate(
  settings: Record<string, string>,
  storedMcpConfig?: string
): Record<string, string> {
  const prepared: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== "string") {
      throw new Error(`Setting "${key}" must be a string.`);
    }
    prepared[key] = key === OUTLOOK_MCP_CONFIG_KEY && value.trim()
      ? mergeMaskedMcpEmailConfig(value, storedMcpConfig)
      : value;
  }
  return prepared;
}
