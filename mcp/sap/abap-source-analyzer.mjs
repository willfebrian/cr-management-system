const STATEMENT_PATTERNS = {
  includes: /^\s*INCLUDE\s+([A-Z0-9_\/]+)\s*\.?/i,
  callFunctions: /^\s*CALL\s+FUNCTION\s+['`]([^'`]+)['`]/i,
  callTransactions: /^\s*CALL\s+TRANSACTION\s+['`]?([A-Z0-9_]+)['`]?/i,
  submits: /^\s*SUBMIT\s+([A-Z0-9_\/]+)/i,
  selects: /\bSELECT\b[\s\S]*?\bFROM\s+([A-Z0-9_\/]+)/i,
  updates: /^\s*UPDATE\s+([A-Z0-9_\/]+)/i,
  insertDatabase: /^\s*INSERT\s+([A-Z0-9_\/]+)\s+FROM\b/i,
  modifyDatabase: /^\s*MODIFY\s+([A-Z0-9_\/]+)\s+FROM\b/i,
  deleteDatabase: /^\s*DELETE\s+FROM\s+([A-Z0-9_\/]+)/i,
  insertInternal: /^\s*INSERT\s+([^.\s]+)\s+(?:INTO|ASSIGNING|INDEX|REFERENCE|INITIAL|FROM\s+\d+)/i,
  modifyInternal: /^\s*MODIFY\s+([^.\s]+)\s+(?:FROM|TRANSPORTING|INDEX|WHERE)/i,
  deleteInternal: /^\s*DELETE\s+([^.\s]+)\s+(?:INDEX|WHERE|FROM|TO|ADJACENT)/i,
  appendInternal: /^\s*APPEND\s+/i,
  commitWork: /^\s*COMMIT\s+WORK\b/i,
  rollbackWork: /^\s*ROLLBACK\s+WORK\b/i,
  updateTask: /\bIN\s+UPDATE\s+TASK\b/i
};

export function normalizeZrfcReadReportResult(result) {
  const sourceRows = Array.isArray(result?.QTAB) ? result.QTAB : [];
  const sourceLines = sourceRows.map((row, index) => ({
    lineNumber: index + 1,
    text: String(row.LINE || "")
  }));

  return {
    system: result?.SYSTEM,
    program: result?.PROGRAM,
    trdir: result?.TRDIR,
    lineCount: sourceLines.length,
    sourceLines
  };
}

export function analyzeAbapSource(sourceLines) {
  const statements = toStatements(sourceLines);
  const findings = {
    includes: [],
    callFunctions: [],
    callTransactions: [],
    submitPrograms: [],
    tableReads: [],
    databaseWrites: [],
    internalTableWrites: [],
    transactionSignals: [],
    writeSignals: []
  };

  for (const statement of statements) {
    const text = statement.text;
    const lineNumber = statement.lineNumber;

    collectSingleMatch(findings.includes, STATEMENT_PATTERNS.includes, text, lineNumber);
    collectSingleMatch(findings.callFunctions, STATEMENT_PATTERNS.callFunctions, text, lineNumber);
    collectSingleMatch(findings.callTransactions, STATEMENT_PATTERNS.callTransactions, text, lineNumber);
    collectSingleMatch(findings.submitPrograms, STATEMENT_PATTERNS.submits, text, lineNumber);
    collectSingleMatch(findings.tableReads, STATEMENT_PATTERNS.selects, text, lineNumber);

    for (const joinMatch of text.matchAll(/\bJOIN\s+([A-Z0-9_\/]+)/gi)) {
      findings.tableReads.push({ value: joinMatch[1].toUpperCase(), lineNumber });
    }

    collectDatabaseWrite(findings, "UPDATE", STATEMENT_PATTERNS.updates, text, lineNumber);
    collectDatabaseWrite(findings, "INSERT", STATEMENT_PATTERNS.insertDatabase, text, lineNumber);
    collectDatabaseWrite(findings, "MODIFY", STATEMENT_PATTERNS.modifyDatabase, text, lineNumber);
    collectDatabaseWrite(findings, "DELETE", STATEMENT_PATTERNS.deleteDatabase, text, lineNumber);

    collectInternalWrite(findings, "INSERT", STATEMENT_PATTERNS.insertInternal, text, lineNumber);
    collectInternalWrite(findings, "MODIFY", STATEMENT_PATTERNS.modifyInternal, text, lineNumber);
    collectInternalWrite(findings, "DELETE", STATEMENT_PATTERNS.deleteInternal, text, lineNumber);
    if (STATEMENT_PATTERNS.appendInternal.test(text)) {
      findings.internalTableWrites.push({ operation: "APPEND", target: "internal_table", lineNumber });
    }

    if (STATEMENT_PATTERNS.commitWork.test(text)) {
      findings.transactionSignals.push({ operation: "COMMIT_WORK", lineNumber });
    }
    if (STATEMENT_PATTERNS.rollbackWork.test(text)) {
      findings.transactionSignals.push({ operation: "ROLLBACK_WORK", lineNumber });
    }
    if (STATEMENT_PATTERNS.updateTask.test(text)) {
      findings.transactionSignals.push({ operation: "UPDATE_TASK", lineNumber });
    }
  }

  return {
    includes: uniqueByValue(findings.includes),
    callFunctions: uniqueByValue(findings.callFunctions),
    callTransactions: uniqueByValue(findings.callTransactions),
    submitPrograms: uniqueByValue(findings.submitPrograms),
    tableReads: uniqueByValue(findings.tableReads),
    tableWrites: uniqueByValue(findings.databaseWrites),
    databaseWrites: uniqueByValue(findings.databaseWrites),
    internalTableWrites: findings.internalTableWrites,
    transactionSignals: findings.transactionSignals,
    writeSignals: findings.writeSignals
  };
}

function toStatements(sourceLines) {
  const statements = [];
  let current = "";
  let startLineNumber = 0;

  for (const line of sourceLines) {
    const text = stripCommentTail(line.text);
    if (!text.trim() || text.trimStart().startsWith("*")) continue;

    if (!current) startLineNumber = line.lineNumber;
    current = `${current} ${text.trim()}`.trim();

    if (text.includes(".")) {
      statements.push({ lineNumber: startLineNumber, text: current });
      current = "";
      startLineNumber = 0;
    }
  }

  if (current) statements.push({ lineNumber: startLineNumber, text: current });
  return statements;
}

function collectSingleMatch(target, pattern, text, lineNumber) {
  const match = text.match(pattern);
  if (!match) return;
  target.push({ value: match[1].toUpperCase(), lineNumber });
}

function collectDatabaseWrite(findings, operation, pattern, text, lineNumber) {
  const match = text.match(pattern);
  if (!match) return;

  const tableName = match[1].toUpperCase();
  if (looksLikeInternalTable(tableName)) return;
  findings.databaseWrites.push({ value: tableName, lineNumber });
  findings.writeSignals.push({ type: "database", operation, tableName, lineNumber });
}

function collectInternalWrite(findings, operation, pattern, text, lineNumber) {
  const match = text.match(pattern);
  if (!match) return;

  findings.internalTableWrites.push({ operation, target: match[1].toUpperCase(), lineNumber });
}

function looksLikeInternalTable(name) {
  return /^(LT|GT|IT|CT|ET|RT|PT|T)_/.test(name);
}

function stripCommentTail(text) {
  const quoteIndex = text.indexOf('"');
  if (quoteIndex < 0) return text;
  return text.slice(0, quoteIndex);
}

function uniqueByValue(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    result.push(item);
  }

  return result;
}
