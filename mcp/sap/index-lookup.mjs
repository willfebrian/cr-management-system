import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

export function lookupDdicTable(tableName) {
  const normalized = String(tableName || "").toUpperCase();
  const filePath = path.join(projectRoot, "data", "ddic-index", "tables", `${normalized}.json`);
  return readJson(filePath);
}

export function lookupAbapProgram(programName) {
  const normalized = String(programName || "").toUpperCase();
  const riskSummary = readJson(path.join(projectRoot, "data", "abap-index", "risk-summary.json"));
  const programs = Object.values(riskSummary.risks || {}).flat();
  return programs.find((program) => program.program === normalized) || null;
}

export function lookupTcode(tcode) {
  const normalized = String(tcode || "").toUpperCase();
  const catalog = readJson(path.join(projectRoot, "data", "abap-index", "z-tcode-catalog.json")) || { entries: [] };
  const analysisManifest = readJson(path.join(projectRoot, "data", "abap-index", "manifest.json"));
  const entry = (catalog.entries || []).find((item) => item.tcode === normalized);
  return {
    catalog: entry || null,
    indexManifest: analysisManifest
  };
}

export function getAbapRiskSummary() {
  return readJson(path.join(projectRoot, "data", "abap-index", "risk-summary.json"));
}

export function getSubmitGraph() {
  return readJson(path.join(projectRoot, "data", "abap-index", "submit-graph.json"));
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
