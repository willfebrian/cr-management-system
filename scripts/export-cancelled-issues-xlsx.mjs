import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const schema = process.env.PGSCHEMA || process.env.PG_SCHEMA || "cr_management";
const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        options: `-c search_path=${schema},public`
      }
);

const outputDir = path.resolve("outputs");
const outputPath = path.join(outputDir, `cancelled-issues-${timestampForFile()}.xlsx`);

const issueRows = await queryRows(`
  SELECT
    h.id,
    h.issue_no,
    h.sub_issue_no,
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    h.issue_name,
    h.issue_status,
    h.requester_name_snapshot,
    h.abaper_name_snapshot,
    h.create_issue_date::text,
    h.cancelled_date::text,
    h.cancelled_reason,
    h.cancelled_by_name_snapshot,
    h.email_subject,
    h.email_date_received::text,
    h.problem_analysis,
    h.impact_analysis,
    h.created_at::text,
    h.updated_at::text,
    COALESCE(glpi.glpi_tickets, '') AS glpi_tickets,
    COALESCE(helpdesk.cr_helpdesk_numbers, '') AS cr_helpdesk_numbers,
    COALESCE(cr.cr_links, '') AS cr_links
  FROM issue_headers h
  LEFT JOIN LATERAL (
    SELECT string_agg(ticket_number::text, '; ' ORDER BY is_primary DESC, ticket_number) AS glpi_tickets
    FROM issue_glpi_tickets
    WHERE issue_id = h.id
  ) glpi ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(cr_helpdesk_no, '; ' ORDER BY is_primary DESC, cr_helpdesk_no) AS cr_helpdesk_numbers
    FROM issue_cr_helpdesk_numbers
    WHERE issue_id = h.id
  ) helpdesk ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(sap_system_code || ':' || trkorr, '; ' ORDER BY is_primary DESC, trkorr) AS cr_links
    FROM issue_cr_links
    WHERE issue_id = h.id
  ) cr ON true
  WHERE h.issue_status = 'cancelled'
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC
`);

const issueIds = issueRows.map((row) => row.id);

const crRows = issueIds.length ? await queryRows(`
  SELECT
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    l.sap_system_code,
    l.trkorr,
    l.relation_type,
    l.is_primary,
    l.cr_description_snapshot,
    r.status_group,
    r.changed_date::text,
    r.changed_time::text,
    r.sap_created_at::text,
    r.sap_created_source,
    r.sap_released_at::text,
    r.sap_released_source,
    qa.import_date::text AS qa_import_date,
    qa.import_time::text AS qa_import_time,
    prd.import_date::text AS prd_import_date,
    prd.import_time::text AS prd_import_time
  FROM issue_cr_links l
  JOIN issue_headers h ON h.id = l.issue_id
  LEFT JOIN cr_requests r ON r.sap_system_code = l.sap_system_code AND r.trkorr = l.trkorr
  LEFT JOIN LATERAL (
    SELECT COALESCE(import_date, imported_at::date) AS import_date,
           COALESCE(import_time, imported_at::time) AS import_time
    FROM cr_transport_lifecycle
    WHERE source_system_code = 'DEV'
      AND target_system_code = 'QA'
      AND trkorr = l.trkorr
      AND transport_status = 'imported'
    ORDER BY COALESCE(import_date, imported_at::date) DESC
    LIMIT 1
  ) qa ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(import_date, imported_at::date) AS import_date,
           COALESCE(import_time, imported_at::time) AS import_time
    FROM cr_transport_lifecycle
    WHERE source_system_code = 'DEV'
      AND target_system_code = 'PRD'
      AND trkorr = l.trkorr
      AND transport_status = 'imported'
    ORDER BY COALESCE(import_date, imported_at::date) DESC
    LIMIT 1
  ) prd ON true
  WHERE l.issue_id = ANY($1::bigint[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC, l.is_primary DESC, l.trkorr
`, [issueIds]) : [];

const glpiRows = issueIds.length ? await queryRows(`
  SELECT
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    g.ticket_number,
    g.is_primary
  FROM issue_glpi_tickets g
  JOIN issue_headers h ON h.id = g.issue_id
  WHERE g.issue_id = ANY($1::bigint[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC, g.is_primary DESC, g.ticket_number
`, [issueIds]) : [];

const helpdeskRows = issueIds.length ? await queryRows(`
  SELECT
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    c.cr_helpdesk_no,
    c.is_primary
  FROM issue_cr_helpdesk_numbers c
  JOIN issue_headers h ON h.id = c.issue_id
  WHERE c.issue_id = ANY($1::bigint[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC, c.is_primary DESC, c.cr_helpdesk_no
`, [issueIds]) : [];

const participantRows = issueIds.length ? await queryRows(`
  SELECT
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    p.role,
    p.source_field,
    p.person_name_snapshot,
    p.is_primary,
    people.full_name,
    people.nickname,
    people.department,
    people.email
  FROM issue_participants p
  JOIN issue_headers h ON h.id = p.issue_id
  LEFT JOIN issue_people people ON people.id = p.person_id
  WHERE p.issue_id = ANY($1::bigint[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC, p.role, p.is_primary DESC, p.person_name_snapshot
`, [issueIds]) : [];

const timelineRows = issueIds.length ? await queryRows(`
  SELECT
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    dev.dev_tested_date::text,
    dev.dev_evaluated_date::text,
    qa.qa_tested_date::text,
    qa.qa_evaluated_date::text,
    prd.prd_requested_date::text,
    prd.prd_evaluated_date::text,
    prd.approval_date::text
  FROM issue_headers h
  LEFT JOIN issue_dev_timeline dev ON dev.issue_id = h.id
  LEFT JOIN issue_qa_timeline qa ON qa.issue_id = h.id
  LEFT JOIN issue_prd_timeline prd ON prd.issue_id = h.id
  WHERE h.id = ANY($1::bigint[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC
`, [issueIds]) : [];

const historyRows = issueIds.length ? await queryRows(`
  SELECT
    h.issue_no::text || '-' || h.sub_issue_no AS issue_key,
    s.from_status,
    s.to_status,
    s.reason,
    s.changed_by_name_snapshot,
    s.changed_at::text
  FROM issue_status_history s
  JOIN issue_headers h ON h.id = s.issue_id
  WHERE s.issue_id = ANY($1::bigint[])
  ORDER BY h.issue_no DESC, h.sub_issue_no DESC, s.changed_at DESC, s.id DESC
`, [issueIds]) : [];

await pool.end();

const sheets = [
  {
    name: "Summary",
    rows: [
      ["Cancelled Issue Export"],
      ["Generated At", new Date().toISOString()],
      ["Total Cancelled Issues", issueRows.length],
      [],
      ["Sheet", "Rows"],
      ["Cancelled Issues", issueRows.length],
      ["CR Links", crRows.length],
      ["GLPI Tickets", glpiRows.length],
      ["CR Helpdesk", helpdeskRows.length],
      ["Participants", participantRows.length],
      ["Timelines", timelineRows.length],
      ["Status History", historyRows.length]
    ],
    widths: [30, 26]
  },
  {
    name: "Cancelled Issues",
    rows: tableRows([
      "Issue Key", "Issue No", "Sub Issue", "Issue Name", "Status", "Requester", "ABAPer",
      "Created On", "Cancelled On", "Cancel Reason", "Cancelled By", "Email Subject",
      "Email Date Received", "Problem Analysis", "Impact Analysis", "GLPI Tickets",
      "CR Helpdesk Nos", "CR Links", "DB Created At", "DB Updated At"
    ], issueRows.map((row) => [
      row.issue_key, row.issue_no, row.sub_issue_no, row.issue_name, row.issue_status,
      row.requester_name_snapshot, row.abaper_name_snapshot, row.create_issue_date,
      row.cancelled_date, row.cancelled_reason, row.cancelled_by_name_snapshot,
      row.email_subject, row.email_date_received, row.problem_analysis, row.impact_analysis,
      row.glpi_tickets, row.cr_helpdesk_numbers, row.cr_links, row.created_at, row.updated_at
    ])),
    widths: [14, 10, 10, 45, 13, 24, 24, 22, 22, 55, 24, 45, 22, 55, 55, 20, 22, 28, 22, 22]
  },
  {
    name: "CR Links",
    rows: objectRows(crRows),
    widths: [14, 12, 16, 14, 10, 48, 14, 16, 14, 14, 22, 18, 22, 18, 14, 14, 14, 14]
  },
  {
    name: "GLPI Tickets",
    rows: objectRows(glpiRows),
    widths: [14, 16, 10]
  },
  {
    name: "CR Helpdesk",
    rows: objectRows(helpdeskRows),
    widths: [14, 20, 10]
  },
  {
    name: "Participants",
    rows: objectRows(participantRows),
    widths: [14, 20, 20, 28, 10, 28, 18, 18, 28]
  },
  {
    name: "Timelines",
    rows: objectRows(timelineRows),
    widths: [14, 22, 22, 22, 22, 22, 22, 22]
  },
  {
    name: "Status History",
    rows: objectRows(historyRows),
    widths: [14, 14, 14, 55, 24, 22]
  }
];

await fs.mkdir(outputDir, { recursive: true });
await writeXlsx(outputPath, sheets);

console.log(JSON.stringify({
  outputPath,
  cancelledIssueCount: issueRows.length,
  sheets: sheets.map((sheet) => ({ name: sheet.name, rows: Math.max(sheet.rows.length - 1, 0) }))
}, null, 2));

async function queryRows(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function tableRows(headers, rows) {
  return [headers, ...rows];
}

function objectRows(rows) {
  const headers = rows[0] ? Object.keys(rows[0]).map(titleCase) : ["No Data"];
  return [headers, ...rows.map((row) => Object.keys(rows[0] || {}).map((key) => row[key]))];
}

function titleCase(value) {
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timestampForFile() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function writeXlsx(filePath, workbookSheets) {
  const files = new Map();
  files.set("[Content_Types].xml", contentTypes(workbookSheets.length));
  files.set("_rels/.rels", rootRels());
  files.set("xl/workbook.xml", workbookXml(workbookSheets));
  files.set("xl/_rels/workbook.xml.rels", workbookRels(workbookSheets.length));
  files.set("xl/styles.xml", stylesXml());
  workbookSheets.forEach((sheet, index) => {
    files.set(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet));
  });
  const buffer = zipStore(files);
  await fs.writeFile(filePath, buffer);
}

function contentTypes(sheetCount) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`);
}

function rootRels() {
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
}

function workbookXml(workbookSheets) {
  const sheetRefs = workbookSheets.map((sheet, index) =>
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("");
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetRefs}</sheets>
</workbook>`);
}

function workbookRels(sheetCount) {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function stylesXml() {
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD8E0EA"/></left><right style="thin"><color rgb="FFD8E0EA"/></right><top style="thin"><color rgb="FFD8E0EA"/></top><bottom style="thin"><color rgb="FFD8E0EA"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

function sheetXml(sheet) {
  const rows = sheet.rows.length ? sheet.rows : [["No Data"]];
  const maxCols = Math.max(...rows.map((row) => row.length));
  const cols = Array.from({ length: maxCols }, (_, index) => {
    const width = sheet.widths?.[index] || 18;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: maxCols }, (_, colIndex) =>
      cellXml(row[colIndex], rowIndex, colIndex, rowIndex === 0 ? 1 : 2)
    ).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const ref = `A1:${columnName(maxCols)}${rows.length}`;
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${ref}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="${ref}"/>
</worksheet>`);
}

function cellXml(value, rowIndex, colIndex, styleId) {
  const ref = `${columnName(colIndex + 1)}${rowIndex + 1}`;
  if (value === null || value === undefined) return `<c r="${ref}" s="${styleId}"/>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${styleId}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" s="${styleId}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xml(value) {
  return Buffer.from(value.trim(), "utf8");
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, data] of files.entries()) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

var crcTableCache;

function getCrcTable() {
  if (!crcTableCache) {
    crcTableCache = Array.from({ length: 256 }, (_, index) => {
      let crc = index;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      return crc >>> 0;
    });
  }
  return crcTableCache;
}
