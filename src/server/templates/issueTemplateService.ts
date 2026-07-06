import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { getCrDetailForSystem } from "../db/crRepository.js";
import { getIssueDetail } from "../db/issueRepository.js";
import type { CrDetail } from "../../shared/types.js";

export type IssueTemplateKind = "email" | "ticket";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

export async function buildIssueTemplatePreview(issueId: number, kind: IssueTemplateKind) {
  const detail = await getIssueDetail(issueId);
  if (!detail.issue) throw new Error("Issue not found.");

  const primaryCr = detail.crLinks.find((link) => link.is_primary) || detail.crLinks[0];
  if (!primaryCr?.trkorr) throw new Error("Issue does not have CR SAP No.");

  const crDetail = await getCrDetailForSystem(primaryCr.trkorr, primaryCr.sap_system_code || "DEV");
  const templatePath = issueTemplatePath(kind);
  const paragraphs = readDocxParagraphs(templatePath);
  const primaryGlpi = detail.glpi.find((ticket) => ticket.is_primary)?.ticket_number || detail.glpi[0]?.ticket_number;
  const values = {
    glpi: formatGlpiTemplate(primaryGlpi),
    glpiLink: formatGlpiLink(primaryGlpi),
    issueKey: detail.issue.issue_key || `${detail.issue.issue_no}-${detail.issue.sub_issue_no}`,
    issueName: detail.issue.issue_name || "-",
    cr: primaryCr.trkorr,
    crDescription: crDetail.request?.description || primaryCr.cr_description_snapshot || "-",
    objectList: formatTemplateObjectList(crDetail)
  };

  return {
    kind,
    title: kind === "email" ? "Generate Email Template" : "Generate GLPI Ticket Template",
    templatePath,
    ...renderTemplateParagraphs(paragraphs, values, kind)
  };
}

function issueTemplatePath(kind: IssueTemplateKind) {
  const filePath = kind === "email"
    ? path.join(projectRoot, "templates", "issue", "email", "email.docx")
    : path.join(projectRoot, "templates", "issue", "ticket", "ticket.docx");
  if (!fs.existsSync(filePath)) throw new Error(`Template file was not found: ${filePath}`);
  return filePath;
}

type TemplateParagraph = {
  text: string;
  html: string;
  style?: string;
  listLevel?: number;
  listId?: string;
  listType?: "ordered" | "bulleted";
};

function renderTemplateParagraphs(paragraphs: TemplateParagraph[], values: {
  glpi: string;
  glpiLink: string;
  issueKey: string;
  issueName: string;
  cr: string;
  crDescription: string;
  objectList: string;
}, kind: IssueTemplateKind) {
  const rendered: string[] = [];
  const renderedHtml: string[] = [];
  let objectListInserted = false;

  for (const paragraph of paragraphs) {
    if (/<<\s*(judul|item) object/i.test(paragraph.text)) {
      if (!objectListInserted) {
        rendered.push(values.objectList || "-");
        const objectListHtml = formatTemplateObjectListHtml(values.objectList);
        const previousIndex = renderedHtml.length - 1;
        if (previousIndex >= 0) {
          renderedHtml[previousIndex] = appendNestedListToPreviousListItem(renderedHtml[previousIndex], objectListHtml);
        } else {
          renderedHtml.push(objectListHtml);
        }
        objectListInserted = true;
      }
      continue;
    }

    const plainText = paragraph.text
      .replace(/<<nomor GLPI,\s*format [^>]+>>/gi, values.glpi)
      .replace(/\[GLPI\s+#\d+\]/gi, `[GLPI #${values.glpi}]`)
      .replace(/<<link GLPI>>/gi, values.glpiLink)
      .replace(/<<issue-sub issue>>/gi, values.issueKey)
      .replace(/<<deskripsi issue>>/gi, values.issueName)
      .replace(/<<nomor CR SAP>>/gi, values.cr)
      .replace(/<<deskripsi CR SAP>>/gi, values.crDescription);
    rendered.push(plainText);

    renderedHtml.push(wrapTemplateParagraphHtml(replaceTemplateHtml(paragraph.html, values), paragraph, plainText));
  }

  return {
    body: rendered.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    bodyHtml: normalizeTemplateHtml(mergeAdjacentTemplateLists(renderedHtml.join("")), kind)
  };
}

function formatTemplateObjectList(crDetail: CrDetail) {
  const groups = new Map<string, { label: string; names: Set<string> }>();
  for (const object of crDetail.objects) {
    const key = `${object.pgmid || "-"} ${object.object_type || "-"}`;
    if (key.toUpperCase() === "CORR RELE") continue;
    const label = se03ObjectLabel(object.pgmid, object.object_type);
    if (!groups.has(key)) groups.set(key, { label, names: new Set() });
    groups.get(key)!.names.add(object.object_name || "-");
  }
  return [...groups.values()]
    .map((group) => [group.label, ...group.names].join("\n"))
    .join("\n\n");
}

function se03ObjectLabel(pgmid?: string, objectType?: string) {
  const key = `${pgmid || ""} ${objectType || ""}`.trim().toUpperCase();
  const labels: Record<string, string> = {
    "LIMU REPS": "Source/include ABAP",
    "LIMU FUNC": "Function Module",
    "LIMU CUAD": "GUI Status",
    "LIMU METH": "Method",
    "LIMU CLSD": "Class Definition",
    "LIMU CPUB": "Class Public Section",
    "LIMU CPRI": "Class Private Section",
    "LIMU CPRO": "Class Protected Section",
    "R3TR CLAS": "Class",
    "R3TR PROG": "Program",
    "R3TR FUGR": "Function Group",
    "R3TR TABL": "Table",
    "LIMU TABD": "Table contents",
    "R3TR TTYP": "Table Type",
    "R3TR TRAN": "Transaction"
  };
  return labels[key] || key || "Object";
}

function formatGlpiTemplate(value?: number) {
  if (!value) return "-";
  return String(value).padStart(7, "0");
}

function formatGlpiLink(value?: number) {
  if (!value) return "-";
  return `https://itsm.trst.co.id/front/ticket.form.php?id=${value}`;
}

function readDocxParagraphs(filePath: string) {
  const xml = readZipEntry(filePath, "word/document.xml").toString("utf8");
  const numberingFormats = readNumberingFormats(filePath);
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  return paragraphs
    .map((paragraph) => extractParagraphRich(paragraph, numberingFormats));
}

function extractParagraphText(paragraphXml: string) {
  const parts: string[] = [];
  const tokenRegex = /<w:(t|tab|br)(?:\s[^>]*)?\/>|<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(paragraphXml))) {
    if (match[0].startsWith("<w:tab")) {
      parts.push("\t");
    } else if (match[0].startsWith("<w:br")) {
      parts.push("\n");
    } else {
      parts.push(decodeXml(match[2] || ""));
    }
  }
  return parts.join("");
}

function extractParagraphRich(paragraphXml: string, numberingFormats: Map<string, string>): TemplateParagraph {
  const runs = paragraphXml.match(/<w:r[\s\S]*?<\/w:r>/g) || [];
  const textParts: string[] = [];
  const htmlParts: string[] = [];

  for (const run of runs) {
    const text = extractParagraphText(run);
    if (!text && !/<w:(tab|br)\b/.test(run)) continue;
    textParts.push(text);
    htmlParts.push(wrapRunHtml(text, run));
  }

  const fallbackText = textParts.join("") || extractParagraphText(paragraphXml);
  const fallbackHtml = htmlParts.join("") || escapeHtml(fallbackText);
  const listMeta = extractListMeta(paragraphXml, numberingFormats);
  const style = extractParagraphStyle(paragraphXml);
  return {
    text: fallbackText,
    html: `<p${style ? ` style="${style}"` : ""}>${fallbackHtml}</p>`,
    style,
    ...listMeta
  };
}

function extractListMeta(paragraphXml: string, numberingFormats: Map<string, string>) {
  const numPr = paragraphXml.match(/<w:numPr[\s\S]*?<\/w:numPr>/);
  if (!numPr) return {};
  const ilvl = numPr[0].match(/<w:ilvl[^>]*w:val="([^"]+)"/);
  const numId = numPr[0].match(/<w:numId[^>]*w:val="([^"]+)"/);
  const listLevel = Number(ilvl?.[1] || 0);
  const listId = numId?.[1] || "";
  const format = numberingFormats.get(`${listId}:${listLevel}`) || numberingFormats.get(`${listId}:0`) || "";
  return {
    listLevel,
    listId,
    listType: format === "decimal" || format.includes("Letter") || format.includes("Roman") ? "ordered" as const : "bulleted" as const
  };
}

function readNumberingFormats(filePath: string) {
  const formats = new Map<string, string>();
  let xml = "";
  try {
    xml = readZipEntry(filePath, "word/numbering.xml").toString("utf8");
  } catch {
    return formats;
  }

  const abstractFormats = new Map<string, Map<string, string>>();
  for (const abstractMatch of xml.matchAll(/<w:abstractNum[^>]*w:abstractNumId="([^"]+)"[\s\S]*?<\/w:abstractNum>/g)) {
    const levels = new Map<string, string>();
    for (const levelMatch of abstractMatch[0].matchAll(/<w:lvl[^>]*w:ilvl="([^"]+)"[\s\S]*?<w:numFmt[^>]*w:val="([^"]+)"/g)) {
      levels.set(levelMatch[1], levelMatch[2]);
    }
    abstractFormats.set(abstractMatch[1], levels);
  }

  for (const numMatch of xml.matchAll(/<w:num[^>]*w:numId="([^"]+)"[\s\S]*?<w:abstractNumId[^>]*w:val="([^"]+)"[\s\S]*?<\/w:num>/g)) {
    const levels = abstractFormats.get(numMatch[2]);
    if (!levels) continue;
    for (const [level, format] of levels.entries()) {
      formats.set(`${numMatch[1]}:${level}`, format);
    }
  }
  return formats;
}

function wrapRunHtml(text: string, runXml: string) {
  let html = escapeHtml(text);
  if (/<w:br\b/.test(runXml)) html = html.replace(/\n/g, "<br>");
  if (/<w:tab\b/.test(runXml)) html = html.replace(/\t/g, "&emsp;");
  if (/<w:b\b/.test(runXml)) html = `<strong>${html}</strong>`;
  if (/<w:i\b/.test(runXml)) html = `<em>${html}</em>`;
  if (/<w:u\b/.test(runXml)) html = `<u>${html}</u>`;
  const color = runXml.match(/<w:color[^>]*w:val="([A-Fa-f0-9]{6})"/)?.[1];
  if (color && !["auto", "000000"].includes(color.toLowerCase())) html = `<span style="color:#${color}">${html}</span>`;
  return html;
}

function extractParagraphStyle(paragraphXml: string) {
  const styles: string[] = [];
  const before = paragraphXml.match(/<w:spacing[^>]*w:before="(\d+)"/)?.[1];
  const after = paragraphXml.match(/<w:spacing[^>]*w:after="(\d+)"/)?.[1];
  const line = paragraphXml.match(/<w:spacing[^>]*w:line="(\d+)"/)?.[1];
  const left = paragraphXml.match(/<w:ind[^>]*w:left="(-?\d+)"/)?.[1];
  const hanging = paragraphXml.match(/<w:ind[^>]*w:hanging="(-?\d+)"/)?.[1];

  if (before) styles.push(`margin-top:${twipsToPx(before)}px`);
  if (after) styles.push(`margin-bottom:${twipsToPx(after)}px`);
  if (line) styles.push(`line-height:${Math.max(1, Number(line) / 240).toFixed(2)}`);
  if (left && Number(left) !== 0 && !hanging) styles.push(`margin-left:${twipsToPx(left)}px`);
  return styles.join(";");
}

function twipsToPx(value: string) {
  return Math.round((Number(value) || 0) / 15);
}

function replaceTemplateHtml(html: string, values: {
  glpi: string;
  glpiLink: string;
  issueKey: string;
  issueName: string;
  cr: string;
  crDescription: string;
}) {
  return linkifyHtml(replaceStaticGlpiSampleHtml(html, values.glpi)
    .replace(/&lt;&lt;nomor GLPI,\s*format [^&]+&gt;&gt;/gi, escapeHtml(values.glpi))
    .replace(/\[GLPI\s+#\d+\]/gi, `[GLPI #${escapeHtml(values.glpi)}]`)
    .replace(/&lt;&lt;link GLPI&gt;&gt;/gi, escapeHtml(values.glpiLink))
    .replace(/&lt;&lt;issue-sub issue&gt;&gt;/gi, escapeHtml(values.issueKey))
    .replace(/&lt;&lt;deskripsi issue&gt;&gt;/gi, escapeHtml(values.issueName))
    .replace(/&lt;&lt;nomor CR SAP&gt;&gt;/gi, escapeHtml(values.cr))
    .replace(/&lt;&lt;deskripsi CR SAP&gt;&gt;/gi, escapeHtml(values.crDescription)));
}

function replaceStaticGlpiSampleHtml(html: string, glpi: string) {
  const gap = String.raw`(?:\s|&nbsp;|\u00a0|<[^>]+>)*`;
  return html.replace(new RegExp(String.raw`\[${gap}GLPI${gap}#${gap}\d+${gap}\]`, "gi"), `[GLPI #${escapeHtml(glpi)}]`);
}

function wrapTemplateParagraphHtml(html: string, paragraph: TemplateParagraph, plainText: string) {
  if (!plainText.trim()) return "<p>&nbsp;</p>";
  if (paragraph.listLevel === undefined) return html;
  const content = html.replace(/^<p(?:\s[^>]*)?>/, "").replace(/<\/p>$/, "");
  const tag = paragraph.listType === "ordered" ? "ol" : "ul";
  return `<${tag} class="template-paragraph-list level-${Math.max(0, paragraph.listLevel)}"${paragraph.style ? ` style="${paragraph.style}"` : ""}><li>${content}</li></${tag}>`;
}

function formatTemplateObjectListHtml(objectList: string) {
  const groups = objectList.split(/\n{2,}/).map((group) => group.trim()).filter(Boolean);
  if (!groups.length) return "<p>-</p>";
  return `<ul class="template-paragraph-list level-0">${groups.map((group) => {
    const [label, ...items] = group.split("\n").map((line) => line.trim()).filter(Boolean);
    return `<li>${escapeHtml(label || "Object")}${items.length ? `<ul>${items.map((item) => `<li><strong>${escapeHtml(item)}</strong></li>`).join("")}</ul>` : ""}</li>`;
  }).join("")}</ul>`;
}

function appendNestedListToPreviousListItem(previousHtml: string, nestedListHtml: string) {
  if (!/<\/li><\/(?:ul|ol)>$/.test(previousHtml)) return `${previousHtml}${nestedListHtml}`;
  return previousHtml.replace(/<\/li><\/(ul|ol)>$/, `${nestedListHtml}</li></$1>`);
}

function mergeAdjacentTemplateLists(html: string) {
  let merged = html;
  let previous = "";
  while (previous !== merged) {
    previous = merged;
    merged = merged.replace(
      /<\/(ul|ol)><\1 class="(template-paragraph-list level-\d+)">/g,
      ""
    );
  }
  return merged;
}

function normalizeTemplateHtml(html: string, kind: IssueTemplateKind) {
  let normalized = html.replace(/(?:<p><\/p>){3,}/g, "<p></p><p></p>");
  if (kind === "email") {
    normalized = normalizeEmailTemplateHtml(normalized);
  }
  if (kind === "ticket") {
    normalized = normalized
      .replace(/<ol class="template-paragraph-list level-\d+">/g, "<ol>")
      .replace(
        /<p[^>]*>\s*(?:<span[^>]*>)?\s*1\.\s*Dokumen CR User\s*(?:<\/span>)?\s*<\/p>\s*<p[^>]*>\s*(?:<span[^>]*>)?\s*2\.\s*No\. CR User\s*(?:<\/span>)?\s*<\/p>/i,
        "<ol><li>Dokumen CR User</li><li>No. CR User</li></ol>"
      );
  }
  return normalized.trim();
}

function normalizeEmailTemplateHtml(html: string) {
  return html
    .replace(
      /\[GLPI\s*#(\d{7})\]/gi,
      "<strong>[GLPI #$1]</strong>"
    )
    .replace(
      /(<span[^>]*>)?\[GLPI\s*(<\/span>)?\s*(<span[^>]*>)?#(<\/span>)?\s*(<span[^>]*>)?(\d{7})(<\/span>)?\s*(<span[^>]*>)?\](<\/span>)?/gi,
      "<strong>[GLPI #$6]</strong>"
    )
    .replace(/\bITSM GLPI\b/g, "<strong>ITSM GLPI</strong>")
    .replace(/(<span[^>]*>)ITSM GLPI(<\/span>)/g, "$1<strong>ITSM GLPI</strong>$2");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyHtml(html: string) {
  return html.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readZipEntry(zipPath: string, entryName: string) {
  const buffer = readTemplateBuffer(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (name === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Invalid ZIP local header for ${entryName}`);
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return zlib.inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method ${method} for ${entryName}`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function readTemplateBuffer(filePath: string) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    const tempPath = path.join(os.tmpdir(), `cr-template-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
    try {
      fs.copyFileSync(filePath, tempPath);
      return fs.readFileSync(tempPath);
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid DOCX file: end of central directory not found.");
}
