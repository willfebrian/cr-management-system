import { pool } from "../db/pool.js";

/**
 * Replaces token placeholders (e.g. {ISSUE_KEY}, {CR_SAP}, {DATE}) with actual values
 * and cleans up formatting artifacts like duplicate separators or empty brackets.
 */
export function renderNamingPattern(pattern: string, tokens: Record<string, string>): string {
  if (!pattern || !pattern.trim()) return "";
  let result = pattern;

  // Replace tokens case-insensitively
  for (const [key, value] of Object.entries(tokens)) {
    const regex = new RegExp(`\\{${key}\\}`, "gi");
    result = result.replace(regex, value || "");
  }

  // Strip unhandled {TOKENS}
  result = result.replace(/\{[A-Z0-9_]+\}/gi, "");

  // Clean up double spaces, trailing dashes/underscores, empty parentheses
  result = result
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/-\s*-+/g, "-")
    .replace(/_\s*_+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+\./g, ".")
    .trim();

  // Ensure file extension formatting doesn't leave dangling trailing dashes/spaces before extension
  result = result.replace(/[-_\s]+(\.[a-zA-Z0-9]+)$/, "$1");

  return result;
}

/**
 * Fetch a single setting from app_settings with a fallback value.
 */
export async function getAppSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1`,
      [key]
    );
    if (rows.length > 0 && rows[0].setting_value) {
      return rows[0].setting_value.trim();
    }
  } catch (err) {
    console.error(`[getAppSetting] Failed to fetch setting ${key}:`, err);
  }
  return defaultValue;
}
