import { renderMarkdownTemplate } from "../utils/namingPattern.js";

const FONT_STYLE = "font-family:Calibri,Arial,sans-serif;font-size:11pt;";
const LINE_HEIGHT = "14pt";
const TEXT_STYLE = `${FONT_STYLE}line-height:${LINE_HEIGHT};mso-line-height-rule:exactly;`;

function stripAttributes(rawAttributes: string, names: string[]) {
  const pattern = names.join("|");
  return rawAttributes
    .replace(new RegExp(`\\s+(?:${pattern})\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "gi"), "")
    .trim();
}

function applyInlineStyle(html: string, tag: string, style: string) {
  return html.replace(new RegExp(`<${tag}\\b([^>]*)>`, "gi"), (_match, rawAttributes: string) => {
    const attributes = stripAttributes(rawAttributes, ["style"]);
    return `<${tag}${attributes ? ` ${attributes}` : ""} style="${style}">`;
  });
}

function applyEmailListStyles(html: string) {
  const listStack: Array<"ul" | "ol"> = [];
  const markers = ["disc", "circle", "square"] as const;
  return html.replace(/<(\/?)(ul|ol|li)\b([^>]*)>/gi, (_match, slash: string, rawTag: string, rawAttributes: string) => {
    const tag = rawTag.toLowerCase() as "ul" | "ol" | "li";
    if (slash) {
      if (tag !== "li") listStack.pop();
      return `</${tag}>`;
    }
    if (tag === "li") {
      const attributes = stripAttributes(rawAttributes, ["style"]);
      return `<li${attributes ? ` ${attributes}` : ""} style="${TEXT_STYLE}margin:0;padding:0;">`;
    }
    const attributes = stripAttributes(rawAttributes, ["style", "type"]);
    const marker = tag === "ul" ? markers[Math.min(listStack.length, 2)] : "decimal";
    listStack.push(tag);
    return `<${tag}${attributes ? ` ${attributes}` : ""} style="${TEXT_STYLE}margin:0 0 0 24pt;padding:0;list-style-position:outside;list-style-type:${marker};">`;
  });
}

export function buildReminderEmailHtml(sourceHtml: string) {
  let html = sourceHtml.replace(
    /<div\b[^>]*>\s*(?:&nbsp;|\u00a0)?\s*<\/div>/gi,
    `<div style="${TEXT_STYLE}height:${LINE_HEIGHT};margin:0;padding:0;">&nbsp;</div>`
  );
  html = applyInlineStyle(html, "p", `${TEXT_STYLE}margin:0;padding:0;`);
  html = applyEmailListStyles(html);
  return `<div style="${TEXT_STYLE}margin:0;padding:0;color:#000000;">${html}</div>`;
}

export function formatReminderCrTransports(rows: Array<{ trkorr?: string | null }>) {
  return rows.map((row) => String(row.trkorr || "").trim()).filter(Boolean).join(", ") || "-";
}

export function getDefaultReminderNotes(_lifecycleStatus?: string | null, _crTransport?: string | null) {
  return "";
}

function toPlainText(markdown: string) {
  return markdown
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1: $2")
    .replace(/<\/?(?:u|strong|b|em|i)>/gi, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function renderReminderContent(
  template: string,
  tokens: Record<string, string>,
  notes: string
) {
  const values = { ...tokens, NOTES: notes };
  const normalizedTemplate = template.replace(/\(\s*\{GLPI_LINK\}\s*\)/g, "{GLPI_LINK}");
  let body = Object.entries(values).reduce(
    (rendered, [key, value]) => rendered.split(`{${key}}`).join(value),
    normalizedTemplate
  );

  if (!template.includes("{NOTES}")) {
    body = `${body.trim()}\n\n**Notes / Outstanding:**\n${notes}`;
  }

  return {
    body,
    emailText: toPlainText(body),
    previewHtml: buildReminderEmailHtml(renderMarkdownTemplate(body, {}, undefined, { htmlProfile: "glpi" }).bodyHtml)
  };
}
