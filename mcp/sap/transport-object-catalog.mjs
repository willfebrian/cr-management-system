import { normalizeRfcReadTable } from "./ddic-normalizer.mjs";
import { normalizeZrfcReadReportResult } from "./abap-source-analyzer.mjs";

export function buildTransportObjectCatalog({ source, textPool, headers, texts, language = "E" }) {
  const textRows = textPool.E_TAB_TEXTPOOL?.find(row => row.LANGU === language)?.TEXTS || [];
  const symbols = new Map(textRows.filter(row => row.ID === "I").map(row => [row.KEY, row.ENTRY.trim()]));
  const pairs = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*APPEND_OBJECT_TYPE\s+'([^']+)'\s+'([^']+)'\s+TEXT-(\d+)\./i);
    if (!match) continue;
    const [, rawPgmid, rawType, symbol] = match;
    const pgmid = rawPgmid.trim(), objectType = rawType.trim();
    if (!objectType || pgmid === "*") continue;
    const description = symbols.get(symbol);
    if (!description) throw new Error(`Missing CTS text ${symbol} (${pgmid} ${objectType}, ${language})`);
    pairs.set(`${pgmid} ${objectType}`, { pgmid, objectType, description, descriptionSource: "SAPLTR_OBJECTS text pool" });
  }
  if (!pairs.size) throw new Error("No CTS system types found in LTR_OBJECTSF02");
  const logicalTexts = new Map(texts.filter(row => row.OBJECTTYPE === "L" && row.LANGUAGE === language)
    .map(row => [row.OBJECTNAME.trim(), row.DDTEXT.trim()]));
  for (const row of headers) {
    if (row.OBJECTTYPE !== "L") continue;
    const objectType = row.OBJECTNAME.trim();
    const key = `R3TR ${objectType}`;
    if (pairs.has(key)) continue;
    pairs.set(key, { pgmid: "R3TR", objectType, description: logicalTexts.get(objectType) || "", descriptionSource: "OBJH/OBJT" });
  }
  return [...pairs.values()].sort((a, b) => `${a.pgmid} ${a.objectType}`.localeCompare(`${b.pgmid} ${b.objectType}`));
}

export async function fetchTransportObjectCatalog(gateway, { server = "SAP_DEV_AIX", language = "E" } = {}) {
  if (!/^[A-Z]$/.test(language)) throw new Error("Use a one-character SAP language code");
  const call = (rfcName, params) => gateway.call({ server, rfcName, params,
    agentName: "sap_abap_technical_agent", userQuestion: "Read the standard CTS object catalog" });
  const read = async (table, fields, options) => {
    const rows = [];
    for (let skip = 0; ; skip += 500) {
      const result = await call("RFC_READ_TABLE", { QUERY_TABLE: table, DELIMITER: "|",
        FIELDS: fields.map(FIELDNAME => ({ FIELDNAME })), OPTIONS: options.map(TEXT => ({ TEXT })), ROWCOUNT: 500, ROWSKIPS: skip });
      const page = normalizeRfcReadTable(result).rows;
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  };
  const [report, textPool, headers, texts] = await Promise.all([
    call("ZRFC_READ_REPORT", { PROGRAM: "LTR_OBJECTSF02" }),
    call("SIW_RFC_READ_TEXTPOOL", { I_PROG: "SAPLTR_OBJECTS", I_TAB_LANGU: [{ SPRAS: language }] }),
    read("OBJH", ["OBJECTNAME", "OBJECTTYPE"], ["OBJECTTYPE = 'L'"]),
    read("OBJT", ["OBJECTNAME", "OBJECTTYPE", "LANGUAGE", "DDTEXT"], [`OBJECTTYPE = 'L' AND LANGUAGE = '${language}'`])
  ]);
  if (textPool.E_STR_EXCEPTION?.MSGTY === "E" || textPool.E_STR_EXCEPTION?.EXCEPTION) {
    throw new Error("SAP CTS text pool could not be read");
  }
  const normalized = normalizeZrfcReadReportResult(report);
  return buildTransportObjectCatalog({ source: normalized.sourceLines.map(row => row.text).join("\n"), textPool, headers, texts, language });
}
