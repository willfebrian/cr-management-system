import { businessWorkflows } from "../../config/business-workflows.mjs";
import { routeQuestion } from "./agent-router.mjs";

export function planQuestionExecution({ question, inputs = {}, options = {} }) {
  const route = routeQuestion(question);
  const detectedInputs = { ...extractInputs(question), ...normalizeInputs(inputs) };
  const candidates = businessWorkflows
    .map((workflow) => scoreWorkflow(workflow, question, detectedInputs))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.workflow.id.localeCompare(right.workflow.id));
  const selected = candidates[0]?.workflow;

  if (!selected) {
    return {
      ok: false,
      code: "NO_MATCHING_WORKFLOW",
      question,
      route,
      detectedInputs,
      needsClarification: true,
      safetyMode: "READ_ONLY"
    };
  }

  const missingInputs = selected.requiredInputs.filter((name) => !detectedInputs[name]);
  const flags = planFlags(selected, options);
  const args = selected.requiredInputs.map((name) => detectedInputs[name]).filter(Boolean);
  const cliArgs = [...args, ...flags.enabled.map((flag) => flag.cliFlag)];

  return {
    ok: missingInputs.length === 0,
    code: missingInputs.length ? "WORKFLOW_INPUTS_REQUIRED" : "WORKFLOW_READY",
    question,
    route,
    workflow: {
      id: selected.id,
      description: selected.description,
      agents: selected.agents,
      command: selected.command,
      npmCommand: `npm run ${selected.command} -- ${cliArgs.join(" ")}`.trim()
    },
    detectedInputs,
    missingInputs,
    flags,
    needsClarification: missingInputs.length > 0,
    safetyMode: "READ_ONLY",
    executionPolicy: "PLAN_ONLY"
  };
}

function scoreWorkflow(workflow, question, detectedInputs) {
  const normalized = normalize(question);
  const keywordScore = workflow.keywords.filter((keyword) => matchesKeyword(normalized, keyword)).length * 10;
  const inputScore = workflow.requiredInputs.filter((name) => detectedInputs[name]).length * 3;
  const completeBonus = workflow.requiredInputs.every((name) => detectedInputs[name]) ? 5 : 0;
  return { workflow, score: keywordScore + inputScore + completeBonus };
}

function extractInputs(question) {
  const text = String(question || "");
  return compact({
    aufnr: capture(text, /\b(?:PRO|AUFNR|PROCESS ORDER|PRODUCTION ORDER)\s*[:=]?\s*([A-Z0-9]{8,14})\b/i),
    material: capture(text, /\b(?:MATNR|MATERIAL)\s*[:=]?\s*([A-Z0-9_-]{3,18})\b/i),
    batch: capture(text, /\b(?:BATCH|CHARG)\s*[:=]?\s*([A-Z0-9_-]*\d[A-Z0-9_-]*)\b/i),
    vbeln: capture(text, /\b(?:SO|SALES ORDER|VBELN)\s*[:=]?\s*(\d{6,10})\b/i),
    ebeln: capture(text, /\b(?:PO|PURCHASE ORDER|EBELN)\s*[:=]?\s*(\d{6,10})\b/i),
    prueflos: capture(text, /\b(?:INSPECTION LOT|PRUEFLOS)\s*[:=]?\s*(\d{6,14})\b/i),
    bukrs: capture(text, /\bBUKRS\s*[:=]?\s*([A-Z0-9]{4})\b/i),
    belnr: capture(text, /\bBELNR\s*[:=]?\s*(\d{6,10})\b/i),
    gjahr: capture(text, /\bGJAHR\s*[:=]?\s*(\d{4})\b/i),
    kokrs: capture(text, /\bKOKRS\s*[:=]?\s*([A-Z0-9]{4})\b/i)
  });
}

function planFlags(workflow, options) {
  const enabled = [];
  const blocked = [];
  for (const flag of workflow.optionalFlags || []) {
    if (options[flag.name] === true) enabled.push(flag);
    else if (flag.requiresExplicitOptIn) blocked.push(flag);
  }
  return { enabled, blocked };
}

function normalizeInputs(inputs) {
  return Object.fromEntries(Object.entries(inputs || {})
    .map(([key, value]) => [key, String(value || "").trim().toUpperCase()])
    .filter(([, value]) => value));
}

function capture(text, pattern) {
  return text.match(pattern)?.[1]?.toUpperCase();
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value));
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesKeyword(text, keyword) {
  const normalizedKeyword = normalize(keyword);
  if (/^[a-z0-9]{2,10}$/.test(normalizedKeyword)) {
    return new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`).test(text);
  }
  return text.includes(normalizedKeyword);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
