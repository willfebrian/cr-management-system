const CONFIDENCE = new Set(["high", "medium", "low"]);

export function createEvidenceAnswer({
  question,
  answer,
  evidence = [],
  sources = [],
  filters = [],
  confidence = "low",
  limitations = []
}) {
  return {
    question: String(question || "").trim(),
    answer: String(answer || "").trim(),
    evidence: evidence.map(normalizeEvidence),
    sources: sources.map(normalizeSource),
    filters: filters.map(normalizeFilter),
    confidence: CONFIDENCE.has(confidence) ? confidence : "low",
    limitations: limitations.map((item) => String(item || "").trim()).filter(Boolean)
  };
}

export function validateEvidenceAnswer(answer) {
  const issues = [];

  if (!answer?.question) issues.push(issue("MISSING_QUESTION", "Question is required."));
  if (!answer?.answer) issues.push(issue("MISSING_ANSWER", "Answer is required."));
  if (!Array.isArray(answer?.evidence) || answer.evidence.length === 0) {
    issues.push(issue("MISSING_EVIDENCE", "At least one evidence item is required."));
  }
  if (!Array.isArray(answer?.sources) || answer.sources.length === 0) {
    issues.push(issue("MISSING_SOURCES", "At least one source is required."));
  }
  if (!CONFIDENCE.has(answer?.confidence)) {
    issues.push(issue("INVALID_CONFIDENCE", "Confidence must be high, medium, or low."));
  }

  for (const [index, evidence] of (answer?.evidence || []).entries()) {
    if (!evidence.statement) issues.push(issue("EMPTY_EVIDENCE", `Evidence #${index + 1} has no statement.`));
    if (!evidence.sourceRef) issues.push(issue("MISSING_EVIDENCE_SOURCE", `Evidence #${index + 1} has no sourceRef.`));
  }

  for (const [index, source] of (answer?.sources || []).entries()) {
    if (!source.type) issues.push(issue("MISSING_SOURCE_TYPE", `Source #${index + 1} has no type.`));
    if (!source.name) issues.push(issue("MISSING_SOURCE_NAME", `Source #${index + 1} has no name.`));
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function createTableSource(tableName, { server = "SAP_QA", fields = [] } = {}) {
  return normalizeSource({
    type: "table",
    name: tableName,
    server,
    fields
  });
}

export function createProgramSource(programName, { server = "SAP_DEV_AIX", includes = [] } = {}) {
  return normalizeSource({
    type: "program",
    name: programName,
    server,
    includes
  });
}

export function createEvidence(statement, sourceRef, { confidence = "high", relation = "direct" } = {}) {
  return normalizeEvidence({
    statement,
    sourceRef,
    confidence,
    relation
  });
}

export function createFilter(sourceRef, where) {
  return normalizeFilter({ sourceRef, where });
}

function normalizeEvidence(item) {
  return {
    statement: String(item?.statement || item || "").trim(),
    sourceRef: String(item?.sourceRef || "").trim(),
    confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : "high",
    relation: String(item?.relation || "direct").trim()
  };
}

function normalizeSource(item) {
  return {
    type: String(item?.type || "").trim(),
    name: String(item?.name || "").trim().toUpperCase(),
    server: String(item?.server || "").trim(),
    fields: Array.isArray(item?.fields) ? item.fields.map((field) => String(field).toUpperCase()) : [],
    includes: Array.isArray(item?.includes) ? item.includes.map((include) => String(include).toUpperCase()) : []
  };
}

function normalizeFilter(item) {
  return {
    sourceRef: String(item?.sourceRef || "").trim(),
    where: typeof item?.where === "string" ? item.where : JSON.stringify(item?.where || {})
  };
}

function issue(code, message) {
  return { severity: "error", code, message };
}

