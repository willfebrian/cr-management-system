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

/**
 * Parses Markdown formatted templates with tokens into plain text and rich HTML.
 */
export function renderMarkdownTemplate(
  template: string,
  tokens: Record<string, string>,
  htmlObjectList?: string,
  options: { htmlProfile?: "default" | "glpi" } = {}
): { body: string; bodyHtml: string } {
  if (!template) return { body: "", bodyHtml: "" };
  const isGlpi = options.htmlProfile === "glpi";

  let text = template;
  for (const [key, value] of Object.entries(tokens)) {
    if (key === "OBJECT_LIST") continue;
    const regex = new RegExp(`\\{${key}\\}`, "gi");
    text = text.replace(regex, value || "");
  }

  // Plain text preparation
  const objectListPlain = tokens["OBJECT_LIST"]
    ? tokens["OBJECT_LIST"].split("\n").map(l => `    ${l}`).join("\n")
    : "-";

  const plainText = text
    .replace(/\{OBJECT_LIST\}/g, objectListPlain)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/<u>(.*?)<\/u>/gi, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/^###\s+/gm, "")
    .replace(/^##\s+/gm, "");

  // HTML parsing
  const lines = text.split("\n");
  const htmlLines: string[] = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check if line contains {OBJECT_LIST}
    if (trimmed === "{OBJECT_LIST}" || trimmed.includes("{OBJECT_LIST}")) {
      const formattedObjList = htmlObjectList || `<ul style="margin: 4px 0; padding-left: 20px;"><li>${tokens["OBJECT_LIST"] || "-"}</li></ul>`;
      if (inUl) {
        // Embed inside the previous <li> tag if possible
        const lastIdx = htmlLines.length - 1;
        if (lastIdx >= 0 && htmlLines[lastIdx].endsWith("</li>")) {
          htmlLines[lastIdx] = htmlLines[lastIdx].replace(/<\/li>$/, `${formattedObjList}</li>`);
        } else {
          htmlLines.push(formattedObjList);
        }
      } else {
        htmlLines.push(formattedObjList);
      }
      continue;
    }

    // Numbered list match (e.g. 1. Dokumen CR User)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) { htmlLines.push("</ul>"); inUl = false; }
      if (!inOl) { htmlLines.push(isGlpi ? "<ol>" : "<ol style='margin: 4px 0; padding-left: 24px;'>"); inOl = true; }
      htmlLines.push(`<li>${processInlineFormatting(olMatch[2], isGlpi)}</li>`);
      continue;
    }

    // Bullet list match (e.g. - Issue no: or • Issue no:)
    const ulMatch = trimmed.match(/^[-•]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) { htmlLines.push("</ol>"); inOl = false; }
      if (!inUl) { htmlLines.push(isGlpi ? "<ul>" : "<ul style='margin: 4px 0; padding-left: 20px;'>"); inUl = true; }
      
      let itemContent = ulMatch[1];

      // If itemContent contains {OBJECT_LIST}
      if (itemContent.includes("{OBJECT_LIST}")) {
        const cleanContent = itemContent.replace("{OBJECT_LIST}", "").trim();
        const formattedObjList = htmlObjectList || `<ul style="margin: 4px 0; padding-left: 20px;"><li>${tokens["OBJECT_LIST"] || "-"}</li></ul>`;
        htmlLines.push(`<li>${processInlineFormatting(cleanContent, isGlpi)}${formattedObjList}</li>`);
      } else {
        htmlLines.push(`<li>${processInlineFormatting(itemContent, isGlpi)}</li>`);
      }
      continue;
    }

    // Close any open lists if paragraph line
    if (inUl) { htmlLines.push("</ul>"); inUl = false; }
    if (inOl) { htmlLines.push("</ol>"); inOl = false; }

    if (trimmed.startsWith("### ")) {
      htmlLines.push(isGlpi
        ? `<h3>${processInlineFormatting(trimmed.substring(4), true)}</h3>`
        : `<h3 style="margin: 12px 0 6px 0; font-size: 1.05rem; font-weight: 700; color: var(--color-text-heading, #111827);">${processInlineFormatting(trimmed.substring(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      htmlLines.push(isGlpi
        ? `<h2>${processInlineFormatting(trimmed.substring(3), true)}</h2>`
        : `<h2 style="margin: 14px 0 8px 0; font-size: 1.2rem; font-weight: 700; color: var(--color-text-heading, #111827);">${processInlineFormatting(trimmed.substring(3))}</h2>`);
    } else if (trimmed === "") {
      htmlLines.push(isGlpi ? "<div>&nbsp;</div>" : "<div style='height: 6px;'></div>");
    } else {
      htmlLines.push(isGlpi
        ? `<p>${processInlineFormatting(trimmed, true)}</p>`
        : `<p style="margin: 4px 0; line-height: 1.5;">${processInlineFormatting(trimmed)}</p>`);
    }
  }

  if (inUl) { htmlLines.push("</ul>"); }
  if (inOl) { htmlLines.push("</ol>"); }

  return {
    body: plainText,
    bodyHtml: htmlLines.join("\n")
  };
}

function processInlineFormatting(str: string, isGlpi = false): string {
  const strongOpen = isGlpi ? "<strong>" : "<b>";
  const strongClose = isGlpi ? "</strong>" : "</b>";
  let res = str
    .replace(/\*\*(.*?)\*\*/g, `${strongOpen}$1${strongClose}`)
    .replace(/\*(.*?)\*/g, "<i>$1</i>")
    .replace(/<u>(.*?)<\/u>/gi, "<u>$1</u>")
    .replace(/`(.*?)`/g, isGlpi
      ? "<code>$1</code>"
      : "<code style='background: var(--color-bg-subtle, #f1f5f9); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85em;'>$1</code>");

  // Auto-link URLs if not already wrapped in <a href>
  res = res.replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
    return isGlpi
      ? `<a href="${url}" target="_blank">${url}</a>`
      : `<a href="${url}" target="_blank" style="color: var(--color-primary, #0f766e); text-decoration: underline;">${url}</a>`;
  });

  return res;
}
