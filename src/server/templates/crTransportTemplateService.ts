import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { getCrDetailForSystem } from "../db/crRepository.js";
import { getIssueDetail } from "../db/issueRepository.js";
import type { CrDetail, IssueDetail } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

type ZipEntry = {
  name: string;
  data: Buffer;
};

type CrTransportObjectClassification = {
  label: string;
  names: string[];
};

export async function buildCrTransportDocument(issueId: number) {
  const detail = await getIssueDetail(issueId);
  if (!detail.issue) throw new Error("Issue not found.");

  const primaryCr = detail.crLinks.find((link) => link.is_primary) || detail.crLinks[0];
  if (!primaryCr?.trkorr) throw new Error("Issue does not have CR SAP No.");

  const crDetail = await getCrDetailForSystem(primaryCr.trkorr, primaryCr.sap_system_code || "DEV");
  const templatePath = crTransportTemplatePath();
  const entries = readZipEntries(templatePath);
  const documentEntry = entries.find((entry) => entry.name === "word/document.xml");
  if (!documentEntry) throw new Error("CR Transport template is missing word/document.xml.");

  const values = buildCrTransportValues(detail, crDetail);
  documentEntry.data = Buffer.from(replaceCrTransportPlaceholders(documentEntry.data.toString("utf8"), values), "utf8");

  const filename = sanitizeFilename(`CR Transport ${detail.issue.issue_key || primaryCr.trkorr}.docx`);
  return {
    filename,
    buffer: writeZipEntries(entries)
  };
}

function crTransportTemplatePath() {
  const filePath = path.join(projectRoot, "templates", "cr_transport", "cr_transport.docx");
  if (!fs.existsSync(filePath)) throw new Error(`Template file was not found: ${filePath}`);
  return filePath;
}

function buildCrTransportValues(detail: IssueDetail, crDetail: CrDetail) {
  const issue = detail.issue!;
  const primaryCr = detail.crLinks.find((link) => link.is_primary) || detail.crLinks[0];
  const primaryGlpi = detail.glpi.find((ticket) => ticket.is_primary)?.ticket_number || detail.glpi[0]?.ticket_number;

  return {
    requesterFullname: participantNames(detail, "requester", "full"),
    crHelpdesk: detail.crHelpdeskNumbers.map((row) => row.cr_helpdesk_no).filter(Boolean).join("; "),
    abaperFullname: participantNames(detail, "abaper", "full"),
    prdDate: formatDateDmy(primaryCr?.prd_import_date),
    crSap: primaryCr?.trkorr || "",
    crSapDescription: crDetail.request?.description || primaryCr?.cr_description_snapshot || "",
    problem: issue.problem_analysis || "",
    impact: issue.impact_analysis || "",
    objectClassifications: formatCrTransportObjectClassifications(crDetail),
    qaTransporter: participantNames(detail, "qa_transporter", "nickname"),
    qaTransportedDate: formatDateDmy(primaryCr?.qa_import_date),
    qaTester: participantNames(detail, "qa_tester", "nickname"),
    qaTestedDate: formatDateDmy(readTimelineDate(detail.qaTimeline, "qa_tested_date")),
    qaEvaluator: participantNames(detail, "qa_evaluator", "nickname"),
    qaEvaluatedDate: formatDateDmy(readTimelineDate(detail.qaTimeline, "qa_evaluated_date")),
    prdRequester: participantNames(detail, "prd_requester", "nickname"),
    prdRequestedDate: formatDateDmy(readTimelineDate(detail.prdTimeline, "prd_requested_date")),
    prdEvaluator: participantNames(detail, "prd_evaluator", "nickname"),
    prdEvaluatedDate: formatDateDmy(readTimelineDate(detail.prdTimeline, "prd_evaluated_date")),
    approval: participantNames(detail, "approval", "nickname"),
    approvalDate: formatDateDmy(readTimelineDate(detail.prdTimeline, "approval_date")),
    prdTransporter: participantNames(detail, "executor", "nickname"),
    prdTransportedDate: formatDateDmy(primaryCr?.prd_import_date),
    glpi: primaryGlpi ? String(primaryGlpi) : ""
  };
}

function participantNames(detail: IssueDetail, role: string, mode: "full" | "nickname") {
  return detail.participants
    .filter((participant) => participant.role === role)
    .map((participant) => {
      if (mode === "nickname") return participant.nickname || participant.person_name_snapshot || participant.full_name || "";
      return participant.full_name || participant.person_name_snapshot || participant.nickname || "";
    })
    .map((value) => value.trim())
    .filter(Boolean)
    .join("; ");
}

function readTimelineDate(timeline: Record<string, unknown> | null, key: string) {
  const value = timeline?.[key];
  return typeof value === "string" ? value : "";
}

function formatCrTransportObjectClassifications(crDetail: CrDetail) {
  const groups = new Map<string, { label: string; names: Set<string> }>();
  for (const object of crDetail.objects) {
    const key = `${object.pgmid || "-"} ${object.object_type || "-"}`.toUpperCase();
    if (key === "CORR RELE") continue;
    const label = se03ObjectLabel(object.pgmid, object.object_type)
      || object.object_label
      || object.object_type_description
      || key
      || "Object";
    if (!groups.has(key)) groups.set(key, { label, names: new Set() });
    groups.get(key)!.names.add(object.object_name || "");
  }

  return [...groups.values()]
    .map((group) => {
      const names = [...group.names].map((name) => name.trim()).filter(Boolean);
      return { label: group.label, names };
    })
    .filter((group) => group.label || group.names.length);
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
  return labels[key];
}

function replaceCrTransportPlaceholders(xml: string, values: ReturnType<typeof buildCrTransportValues>) {
  let rendered = xml;
  const replacements: Record<string, string> = {
    "[Fullname Requester]": values.requesterFullname,
    "[CR Helpdesk]": values.crHelpdesk,
    "[Fullname ABAPer]": values.abaperFullname,
    "[PRD Date]": values.prdDate,
    "[CR SAP]": values.crSap,
    "[CR SAP Description]": values.crSapDescription,
    "[Problem]": values.problem,
    "[Impact]": values.impact,
    "[Nickname QA Transporter]": values.qaTransporter,
    "[QA Transported Date (DD.MM.YYYY)]": values.qaTransportedDate,
    "[Nickname QA Tester]": values.qaTester,
    "[QA Tested Date (DD.MM.YYYY)]": values.qaTestedDate,
    "[Nickname QA Evaluator]": values.qaEvaluator,
    "[QA Evaluated Date (DD.MM.YYYY)]": values.qaEvaluatedDate,
    "[Nickname PRD Requester]": values.prdRequester,
    "[Nickname PRD Evaluator]": values.prdEvaluator,
    "[PRD Evaluated Date (DD.MM.YYYY)]": values.prdEvaluatedDate,
    "[Nickname Approval]": values.approval,
    "[Approval Date (DD.MM.YYYY)]": values.approvalDate,
    "[Nickname PRD Transporter]": values.prdTransporter,
    "[PRD Transported Date (DD.MM.YYYY)]": values.prdTransportedDate
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = replaceAllTextAcrossRuns(rendered, placeholder, value);
  }
  rendered = replaceAllTextAcrossRuns(rendered, "[PRD Requested Date (DD.MM.YYYY)]", values.prdRequestedDate);

  rendered = replaceObjectClassificationPlaceholders(rendered, values.objectClassifications);
  rendered = enlargeProductionApprovalRows(rendered);
  return stripHighlight(rendered);
}

function replaceObjectClassificationPlaceholders(xml: string, groups: CrTransportObjectClassification[]) {
  let rendered = replaceSingleClassificationParagraph(xml, "[Classification 1]", groups[0]);
  rendered = replaceSingleClassificationParagraph(rendered, "[Classification 2]", groups[1]);
  return replaceRepeatingClassificationParagraph(rendered, "[Classification n]", groups.slice(2));
}

function replaceSingleClassificationParagraph(xml: string, marker: string, group?: CrTransportObjectClassification) {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  for (const paragraph of paragraphs) {
    if (!extractRunText(paragraph).includes(marker)) continue;
    return xml.replace(paragraph, group ? renderClassificationParagraph(paragraph, group) : "");
  }
  return xml;
}

function replaceRepeatingClassificationParagraph(xml: string, marker: string, groups: CrTransportObjectClassification[]) {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  for (const paragraph of paragraphs) {
    if (!extractRunText(paragraph).includes(marker)) continue;
    const renderedGroups = groups.map((group) => renderClassificationParagraph(paragraph, group)).join("");
    return xml.replace(paragraph, renderedGroups);
  }
  return xml;
}

function renderClassificationParagraph(paragraph: string, group: CrTransportObjectClassification) {
  const runs = paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
  if (!runs.length) return paragraph;

  const firstRun = runs[0]!;
  const labelRun = runs.find((run) => extractRunText(run).trim().length > 0) || firstRun;
  const itemRun = runs.find((run) => !runHasBold(run) && extractRunText(run).trim().length > 0) || runs[runs.length - 1] || labelRun;
  const renderedLabelRun = setRunText(stripHighlight(labelRun), group.label);
  const itemText = group.names.length ? ` : ${group.names.join(", ")}` : "";
  const renderedItemRun = itemText ? setRunText(stripHighlight(itemRun), itemText) : "";
  let rendered = paragraph.replace(firstRun, `${renderedLabelRun}${renderedItemRun}`);
  for (const run of runs) {
    rendered = rendered.replace(run, "");
  }
  return rendered;
}

function runHasBold(runXml: string) {
  return /<w:b\b[^>]*\/>|<w:b\b[^>]*>/.test(runXml);
}

function enlargeProductionApprovalRows(xml: string) {
  return xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    const rowText = extractRunText(row);
    if (!["Requested By", "Evaluated By", "Approved By", "Execute By"].some((label) => rowText.includes(label))) {
      return row;
    }
    if (/<w:trHeight\b[^>]*\/>/.test(row)) {
      return row.replace(/<w:trHeight\b[^>]*\/>/, '<w:trHeight w:val="92" w:hRule="atLeast"/>');
    }
    if (/<w:trPr\b[^>]*>/.test(row)) {
      return row.replace(/(<w:trPr\b[^>]*>)/, '$1<w:trHeight w:val="92" w:hRule="atLeast"/>');
    }
    return row.replace(/(<w:tr\b[^>]*>)/, '$1<w:trPr><w:trHeight w:val="92" w:hRule="atLeast"/></w:trPr>');
  });
}

function replaceAllTextAcrossRuns(xml: string, placeholder: string, value: string) {
  let rendered = replaceTextInsideTextNodes(xml, placeholder, value);
  return replaceParagraphs(rendered, (paragraph) => {
    let nextParagraph = paragraph;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const next = replaceTextAcrossRuns(nextParagraph, placeholder, value);
      if (next === nextParagraph) break;
      nextParagraph = next;
    }
    return nextParagraph;
  });
}

function replaceParagraphs(xml: string, replacer: (paragraph: string) => string) {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => replacer(paragraph));
}

function replaceTextAcrossRuns(xml: string, placeholder: string, value: string, options: { replaceWholeRunGroup?: boolean } = {}) {
  const tokens = splitRuns(xml);
  const runs = tokens.map((token, index) => token.type === "run" ? { index, text: extractRunText(token.value) } : null).filter(Boolean) as Array<{ index: number; text: string }>;

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    if (!runs[runIndex].text.includes(placeholder[0])) continue;
    let combined = "";
    for (let endIndex = runIndex; endIndex < runs.length && endIndex < runIndex + 30; endIndex += 1) {
      combined += runs[endIndex].text;
      const foundAt = combined.indexOf(placeholder);
      if (foundAt < 0 && combined.length <= placeholder.length + 250) continue;
      if (foundAt < 0) break;

      const firstTokenIndex = runs[runIndex].index;
      const lastTokenIndex = runs[endIndex].index;
      if (!options.replaceWholeRunGroup && firstTokenIndex === lastTokenIndex) {
        tokens[firstTokenIndex].value = replaceTextInsideTextNodes(tokens[firstTokenIndex].value, placeholder, value, true);
        return tokens.map((token) => token.value).join("");
      }

      const replacementText = options.replaceWholeRunGroup
        ? value
        : `${combined.slice(0, foundAt)}${value}${combined.slice(foundAt + placeholder.length)}`;
      tokens[firstTokenIndex].value = setRunText(stripHighlight(tokens[firstTokenIndex].value), replacementText);
      for (let tokenIndex = firstTokenIndex + 1; tokenIndex <= lastTokenIndex; tokenIndex += 1) {
        if (tokens[tokenIndex].type === "run") tokens[tokenIndex].value = "";
      }
      return tokens.map((token) => token.value).join("");
    }
  }
  return xml;
}

function replaceTextInsideTextNodes(xml: string, placeholder: string, value: string, firstOnly = false) {
  const encodedPlaceholder = escapeXml(placeholder);
  const encodedValue = escapeXml(value);
  let replaced = false;
  return xml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs: string, text: string) => {
    if (firstOnly && replaced) return match;
    if (!text.includes(encodedPlaceholder)) return match;
    replaced = true;
    const nextText = firstOnly
      ? text.replace(encodedPlaceholder, encodedValue)
      : text.split(encodedPlaceholder).join(encodedValue);
    return `<w:t${attrs}>${nextText}</w:t>`;
  });
}

function splitRuns(xml: string) {
  const tokens: Array<{ type: "text" | "run"; value: string }> = [];
  const regex = /<w:r\b[\s\S]*?<\/w:r>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    if (match.index > lastIndex) tokens.push({ type: "text", value: xml.slice(lastIndex, match.index) });
    tokens.push({ type: "run", value: match[0] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < xml.length) tokens.push({ type: "text", value: xml.slice(lastIndex) });
  return tokens;
}

function extractRunText(runXml: string) {
  const parts: string[] = [];
  const tokenRegex = /<w:(t|tab|br)(?:\s[^>]*)?\/>|<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(runXml))) {
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

function setRunText(runXml: string, value: string) {
  const textXml = encodeRunText(value);
  const withoutText = runXml.replace(/<w:(?:t|tab|br)(?:\s[^>]*)?\/>|<w:t[^>]*>[\s\S]*?<\/w:t>/g, "");
  if (/<w:rPr[\s\S]*?<\/w:rPr>/.test(withoutText)) {
    return withoutText.replace(/(<w:rPr[\s\S]*?<\/w:rPr>)/, `$1${textXml}`);
  }
  return withoutText.replace(/(<w:r[^>]*>)/, `$1${textXml}`);
}

function stripHighlight(runXml: string) {
  return runXml.replace(/<w:highlight[^>]*\/>/g, "");
}

function encodeRunText(value: string) {
  const lines = value.split(/\r?\n/);
  return lines.map((line, index) => {
    const prefix = index === 0 ? "" : "<w:br/>";
    return `${prefix}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
  }).join("");
}

function formatDateDmy(value?: string) {
  if (!value) return "";
  const normalized = value.trim();
  const ymd = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}.${ymd[2]}.${ymd[1]}`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function sanitizeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ").trim();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readZipEntries(zipPath: string) {
  const buffer = readTemplateBuffer(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error(`Invalid ZIP local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    entries.push({ name, data });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function writeZipEntries(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localData, centralDirectory, eocd]);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readTemplateBuffer(filePath: string) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    const tempPath = path.join(os.tmpdir(), `cr-transport-template-${process.pid}-${Date.now()}-${path.basename(filePath)}`);
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
