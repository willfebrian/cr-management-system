const FONT_STYLE = "font-family:Calibri,Arial,sans-serif;font-size:11pt;";
const LINE_HEIGHT = "14pt";
const TEXT_STYLE = `${FONT_STYLE}line-height:${LINE_HEIGHT};mso-line-height-rule:exactly;`;

function applyInlineStyle(html: string, tag: string, style: string) {
  return html.replace(new RegExp(`<${tag}\\b([^>]*)>`, "gi"), (_match, rawAttributes: string) => {
    const attributes = rawAttributes
      .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
      .trim();
    return `<${tag}${attributes ? ` ${attributes}` : ""} style="${style}">`;
  });
}

function stripAttributes(rawAttributes: string, names: string[]) {
  const pattern = names.join("|");
  return rawAttributes
    .replace(new RegExp(`\\s+(?:${pattern})\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "gi"), "")
    .trim();
}

function applyOfficeListStyles(html: string) {
  const listStack: Array<"ul" | "ol"> = [];
  const unorderedMarkers = ["disc", "circle", "square"] as const;
  const orderedMarkers = [
    { type: "1", style: "decimal" },
    { type: "a", style: "lower-alpha" },
    { type: "i", style: "lower-roman" }
  ] as const;

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

    const depth = Math.min(listStack.length, 2);
    const marker = tag === "ul"
      ? { type: unorderedMarkers[depth], style: unorderedMarkers[depth] }
      : orderedMarkers[depth];
    const attributes = stripAttributes(rawAttributes, ["style", "type"]);
    listStack.push(tag);

    return `<${tag}${attributes ? ` ${attributes}` : ""} type="${marker.type}" style="${TEXT_STYLE}margin:0 0 0 24pt;padding:0;list-style-position:outside;list-style-type:${marker.style};">`;
  });
}

export function buildOfficeClipboardHtml(sourceHtml: string) {
  let html = sourceHtml
    .replace(
      /<div\b[^>]*>\s*(?:&nbsp;|\u00a0)?\s*<\/div>/gi,
      `<div style="${TEXT_STYLE}height:${LINE_HEIGHT};margin:0;padding:0;">&nbsp;</div>`
    );

  html = applyInlineStyle(html, "p", `${TEXT_STYLE}margin:0;padding:0;`);
  html = applyOfficeListStyles(html);

  return `<div style="${TEXT_STYLE}margin:0;padding:0;color:#000000;">${html}</div>`;
}

export function buildTemplateClipboardPayload(template: { body: string; bodyHtml?: string }): {
  text: string;
  html?: string;
} {
  return template.bodyHtml
    ? { text: template.body, html: buildOfficeClipboardHtml(template.bodyHtml) }
    : { text: template.body };
}
