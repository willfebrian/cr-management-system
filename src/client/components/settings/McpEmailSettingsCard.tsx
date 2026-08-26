import { Activity, Loader2, Mail } from "lucide-react";

export type McpConnectionStatus = {
  type: "idle" | "success" | "error";
  message: string;
};

export function validateMcpEmailConfigJson(raw: string): string | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return `MCP configuration must be valid JSON${error instanceof Error ? `: ${error.message}` : "."}`;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "MCP configuration must be a JSON object.";
  }
  const entries = parsed.mcpServers && typeof parsed.mcpServers === "object"
    ? Object.entries(parsed.mcpServers)
    : [];
  if (!entries.length) return "MCP configuration must contain at least one server in mcpServers.";
  for (const [name, rawServer] of entries) {
    const server = rawServer as any;
    if (!server || typeof server !== "object" || server.type !== "http") {
      return `MCP server "${name}" must use HTTP transport.`;
    }
    if (typeof server.url !== "string" || !server.url.trim()) {
      return `MCP server "${name}" must define a URL.`;
    }
    try {
      const url = new URL(server.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return `MCP server "${name}" must use an HTTP or HTTPS URL.`;
      }
    } catch {
      return `MCP server "${name}" URL is invalid.`;
    }
  }
  return null;
}

export function McpEmailSettingsCard({
  configJson,
  maxEmails,
  maxBodyChars,
  validationError,
  connectionStatus,
  testing,
  onConfigChange,
  onMaxEmailsChange,
  onMaxBodyCharsChange,
  onTestConnection
}: {
  configJson: string;
  maxEmails: string;
  maxBodyChars: string;
  validationError: string;
  connectionStatus: McpConnectionStatus;
  testing: boolean;
  onConfigChange: (value: string) => void;
  onMaxEmailsChange: (value: string) => void;
  onMaxBodyCharsChange: (value: string) => void;
  onTestConnection: () => void;
}) {
  return (
    <section className="mcp-email-settings-card">
      <div className="mcp-email-settings-heading">
        <div className="mcp-email-settings-icon"><Mail size={20} /></div>
        <div>
          <h4>Outlook Mail Extraction Configuration</h4>
          <p>Connect an MCP Email server to search and read emails for AI context.</p>
        </div>
      </div>

      <div className="mcp-email-settings-grid">
        <div className="mcp-email-settings-pane mcp-email-settings-json-pane">
          <label htmlFor="outlook-mcp-config">MCP CONFIGURATION (JSON)</label>
          <textarea
            id="outlook-mcp-config"
            value={configJson}
            onChange={(event) => onConfigChange(event.target.value)}
            spellCheck={false}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? "outlook-mcp-config-error" : "outlook-mcp-config-help"}
          />
          {validationError ? (
            <small id="outlook-mcp-config-error" className="mcp-email-settings-error" role="alert">{validationError}</small>
          ) : (
            <small id="outlook-mcp-config-help">JSON is validated automatically. Authorization is masked after saving.</small>
          )}
        </div>

        <div className="mcp-email-settings-pane mcp-email-settings-options">
          <div className="mcp-email-settings-field">
            <label htmlFor="outlook-max-email-count">MAXIMUM EMAILS TO FETCH</label>
            <input
              id="outlook-max-email-count"
              type="number"
              min={1}
              max={50}
              value={maxEmails}
              onChange={(event) => onMaxEmailsChange(event.target.value)}
            />
            <small>Maximum results returned by MCP email search.</small>
          </div>

          <div className="mcp-email-settings-field">
            <label htmlFor="outlook-max-body-chars">MAXIMUM CHARACTERS PER BODY</label>
            <input
              id="outlook-max-body-chars"
              type="number"
              min={1000}
              max={100000}
              step={1000}
              value={maxBodyChars}
              onChange={(event) => onMaxBodyCharsChange(event.target.value)}
            />
            <small>Truncates long message bodies before AI analysis.</small>
          </div>

          <button
            type="button"
            className="mcp-email-settings-test"
            onClick={onTestConnection}
            disabled={testing || Boolean(validationError)}
          >
            {testing ? <Loader2 size={14} className="spinner" /> : <Activity size={14} />}
            {testing ? "Testing MCP Connection..." : "Test MCP Connection"}
          </button>

          {connectionStatus.message ? (
            <div className={`mcp-email-settings-status is-${connectionStatus.type}`} role="status">
              {connectionStatus.type === "success" ? "● " : connectionStatus.type === "error" ? "⚠ " : ""}
              {connectionStatus.message}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
