import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectCrTransportModel } from "../src/server/templates/projectCrTransportService.js";
import { buildProjectCrTransportDocumentFromModel, renderProjectCrTransportXml } from "../src/server/templates/projectCrTransportService.js";
import { readZipEntries } from "../src/server/templates/crTransportTemplateService.js";

const model = {
  project: { id: 1, projectKey: "PRJ-26001", projectName: "Alpha & Beta", projectStatus: "in_progress" },
  firstIssue: { issue: { id: 1, issue_key: "26001-01" } },
  latestIssue: { issue: { id: 2, issue_key: "26002-01" } },
  requester: "Requester One", crHelpdesk: "CRH-1; CRH-2", projectName: "Alpha & Beta",
  qaTransporter: "QATR", qaTransportedDate: "01.07.2026", qaTester: "QATEST", qaTestedDate: "02.07.2026",
  qaEvaluator: "QAEVAL", qaEvaluatedDate: "03.07.2026", prdRequester: "PRDREQ", prdRequestedDate: "04.07.2026",
  prdEvaluator: "PRDEVAL", prdEvaluatedDate: "05.07.2026", approval: "APP", approvalDate: "06.07.2026",
  prdTransporter: "PRDTR", prdTransportedDate: "07.07.2026",
  crRows: [
    { issueId: 1, issueKey: "26001-01", sapSystemCode: "DEV", trkorr: "TRDK1", description: "First & CR", createdDate: "01.07.2026", qaTransportedDate: "02.07.2026", prdTransportedDate: "03.07.2026", qaTester: "TEST1", abaper: "ABAP1" },
    { issueId: 2, issueKey: "26002-01", sapSystemCode: "DEV", trkorr: "TRDK2", description: "Second CR", createdDate: "04.07.2026", qaTransportedDate: "05.07.2026", prdTransportedDate: "06.07.2026", qaTester: "TEST2", abaper: "ABAP2" }
  ]
} as unknown as ProjectCrTransportModel;

test("replaces placeholders, clones CR rows, removes highlights, and preserves grouped drawing", () => {
  const row = `<w:tr><w:tc><w:p><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>[CR SAP 1]</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>[CR SAP Description 1]</w:t></w:r><w:r><w:t>[Created CR Date (DD.MM.YYYY)]</w:t></w:r><w:r><w:t>[QA Transported Date (DD.MM.YYYY)]</w:t></w:r><w:r><w:t>[PRD Transported Date (DD.MM.YYYY)]</w:t></w:r><w:r><w:t>[Nickname QA Tester]</w:t></w:r><w:r><w:t>[Nickname ABAPer]</w:t></w:r></w:p></w:tc></w:tr>`;
  const xml = `<w:document><w:body><w:p><w:r><w:t>[Project </w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Name]</w:t></w:r></w:p><w:p><w:r><w:t>[First Issue - Fullname Requester]</w:t></w:r></w:p><w:drawing><a:graphic><a:graphicData/></a:graphic></w:drawing><w:tbl>${row}${row.replaceAll(" 1]", " 2]")}</w:tbl></w:body></w:document>`;
  const rendered = renderProjectCrTransportXml(xml, model);
  assert.match(rendered, /Alpha &amp; Beta/);
  assert.match(rendered, /Requester One/);
  assert.equal((rendered.match(/<w:tr>/g) || []).length, 2);
  assert.match(rendered, /TRDK1/);
  assert.match(rendered, /TRDK2/);
  assert.match(rendered, /First &amp; CR/);
  assert.doesNotMatch(rendered, /\[CR SAP/);
  assert.doesNotMatch(rendered, /w:highlight/);
  assert.equal((rendered.match(/<a:graphic>/g) || []).length, 1);
});

test("keeps all Production approval rows at the same minimum height", () => {
  const row = (label: string, height: number) => `<w:tr><w:trPr><w:trHeight w:val="${height}"/></w:trPr><w:tc><w:p><w:r><w:t>${label}</w:t></w:r></w:p></w:tc></w:tr>`;
  const xml = `<w:document><w:body><w:tbl>${row("Transported by Tested by Evaluated By", 400)}${row("Requested By", 288)}${row("Evaluated By", 288)}${row("Approved By", 58)}${row("Execute By", 288)}</w:tbl></w:body></w:document>`;

  const rendered = renderProjectCrTransportXml(xml, model);
  const renderedRows = rendered.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  const productionRows = renderedRows.filter((candidate) => ["Requested By", "Evaluated By", "Approved By", "Execute By"].some((label) => candidate.includes(`>${label}<`)));

  assert.match(renderedRows[0] || "", /<w:trHeight w:val="400"\/>/);
  assert.equal(productionRows.length, 4);
  assert.ok(productionRows.every((candidate) => /<w:trHeight w:val="288" w:hRule="atLeast"\/>/.test(candidate)));
});

test("renders the approved Project Word template with dynamic CR rows and preserves the grouped diagram", () => {
  const templatePath = path.resolve("templates/cr_transport_project/cr_transport_project.docx");
  const originalXml = readZipEntries(templatePath).find((entry) => entry.name === "word/document.xml")!.data.toString("utf8");
  const document = buildProjectCrTransportDocumentFromModel(model, templatePath);
  if (process.env.PROJECT_CR_FIXTURE_PATH) fs.writeFileSync(process.env.PROJECT_CR_FIXTURE_PATH, document.buffer);
  if (process.env.PROJECT_CR_MANY_FIXTURE_PATH) {
    const manyModel = {
      ...model,
      crRows: Array.from({ length: 50 }, (_, index) => ({
        ...model.crRows[index % model.crRows.length]!,
        trkorr: `TRDK${String(index + 1).padStart(4, "0")}`,
        description: `Dynamic CR row ${index + 1}`
      }))
    };
    fs.writeFileSync(process.env.PROJECT_CR_MANY_FIXTURE_PATH, buildProjectCrTransportDocumentFromModel(manyModel, templatePath).buffer);
  }
  const tempPath = path.join(os.tmpdir(), `project-cr-${process.pid}.docx`);
  fs.writeFileSync(tempPath, document.buffer);
  try {
    const renderedXml = readZipEntries(tempPath).find((entry) => entry.name === "word/document.xml")!.data.toString("utf8");
    const crTable = (renderedXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || []).find((table) => table.includes("TRDK1"))!;
    const crRows = crTable.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    assert.equal((renderedXml.match(/<w:tr\b/g) || []).length, (originalXml.match(/<w:tr\b/g) || []).length - 2);
    assert.equal((renderedXml.match(/<a:graphic\b/g) || []).length, (originalXml.match(/<a:graphic\b/g) || []).length);
    assert.doesNotMatch(renderedXml, /\[(?:First Issue|Latest Issue|All CR Helpdesk|Project Name|CR SAP)/);
    assert.doesNotMatch(renderedXml, /<w:highlight\b/);
    assert.match(crRows[0] || "", /<w:tblHeader\b/);
    assert.ok(crRows.slice(1).every((row) => /<w:cantSplit\b/.test(row)));
  } finally {
    fs.unlinkSync(tempPath);
  }
});
