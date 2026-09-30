import type { PermissionKey } from "../../shared/permissions.js";

const appearanceKeys = new Set(["app_font_size", "issue_form_layout", "create_issue_form_layout", "change_issue_form_layout"]);
const generalKeys = new Set(["exchange_host", "exchange_user", "exchange_pass", "outlook_mcp_config", "outlook_max_email_count", "outlook_max_body_chars"]);
const aiKeys = new Set(["ai_primary_provider", "ai_fallback_provider", "nine_router_enabled", "nine_router_base_url", "nine_router_model", "nine_router_api_key", "openrouter_enabled", "openrouter_api_key", "openrouter_model", "openrouter_fallback_model", "ai_instruction_glpi", "ai_instruction_email", "ai_instruction_issue_name", "ai_instruction_problem", "ai_instruction_impact"]);

export function settingPermission(key: string): PermissionKey | null {
  if (appearanceKeys.has(key) || /^status_color_[a-z0-9_]+_(bg|text|border)$/.test(key)) return "settings.appearance";
  if (generalKeys.has(key)) return "settings.general";
  if (aiKeys.has(key)) return "settings.ai";
  if (/^template_body_(email|glpi)$/.test(key) || /^filename_pattern_(cr_transport|project_cr_transport|cr_user)$/.test(key)) return "settings.templates";
  return null;
}

export function visibleSettings(settings: Record<string, string>, permissions: readonly PermissionKey[]): Record<string, string> {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => {
    const required = settingPermission(key);
    return required && permissions.includes(required);
  }));
}

export function writableSettings(settings: Record<string, string>, permissions: readonly PermissionKey[]): boolean {
  return Object.keys(settings).length > 0 && Object.keys(settings).every((key) => {
    const required = settingPermission(key);
    return required && permissions.includes(required === "settings.appearance" ? "settings.general" : required);
  });
}

export function transportSystemOptions(rows: Array<Record<string, unknown>>) {
  return rows.map(({ id, code, description, environment, is_active, created_at }) => ({
    id, code, description, environment, is_active, created_at
  }));
}
