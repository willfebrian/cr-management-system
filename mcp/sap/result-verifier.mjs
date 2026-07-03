export function verifyMetadataResult({ tableName, fieldCatalog, relationships, semanticTable }) {
  const issues = [];
  const fields = fieldCatalog?.fields || [];
  const fieldNames = new Set(fields.map((field) => field.fieldName));

  if (!fields.length) {
    issues.push({ severity: "error", code: "NO_FIELDS_RETURNED", message: `${tableName} returned no field metadata.` });
  }

  for (const keyField of semanticTable?.key_fields || []) {
    if (!fieldNames.has(keyField)) {
      issues.push({
        severity: "error",
        code: "MISSING_EXPECTED_KEY_FIELD",
        message: `${tableName} is missing expected key field ${keyField}.`
      });
    }
  }

  if (semanticTable?.large_table && !semanticTable?.mandatory_filters_any?.length) {
    issues.push({
      severity: "warning",
      code: "LARGE_TABLE_WITHOUT_FILTER_RULES",
      message: `${tableName} is marked large but has no mandatory filter rules.`
    });
  }

  return {
    tableName,
    ok: !issues.some((issue) => issue.severity === "error"),
    fieldCount: fields.length,
    relationshipCount: relationships?.relationships?.length || 0,
    issues
  };
}

export function verifySensitivePolicy({ tableName, fieldCatalog, sensitivePolicy }) {
  const upperTable = String(tableName || "").toUpperCase();
  const fields = fieldCatalog?.fields || [];
  const deniedTables = new Set((sensitivePolicy?.denied_tables || []).map((table) => table.toUpperCase()));
  const restrictedTables = new Set((sensitivePolicy?.restricted_tables || []).map((table) => table.toUpperCase()));
  const patterns = sensitivePolicy?.sensitive_field_patterns || [];
  const sensitiveFields = fields.filter((field) =>
    patterns.some((pattern) => String(field.fieldName || "").toUpperCase().includes(pattern.toUpperCase()))
  );

  return {
    tableName: upperTable,
    denied: deniedTables.has(upperTable),
    restricted: restrictedTables.has(upperTable),
    sensitiveFields: sensitiveFields.map((field) => field.fieldName)
  };
}

export function verifyBusinessRows({
  tableName,
  rows = [],
  expectedKeys = [],
  maxRows = 500,
  requireUnitForQuantity = true
}) {
  const issues = [];
  const normalizedRows = Array.isArray(rows) ? rows : [];

  if (normalizedRows.length > maxRows) {
    issues.push({
      severity: "error",
      code: "ROW_COUNT_EXCEEDS_LIMIT",
      message: `${tableName} returned ${normalizedRows.length} rows, above limit ${maxRows}.`
    });
  }

  for (const key of expectedKeys) {
    const missing = normalizedRows.some((row) => !String(row?.[key] ?? "").trim());
    if (missing) {
      issues.push({
        severity: "error",
        code: "MISSING_EXPECTED_ROW_KEY",
        message: `${tableName} has at least one row missing expected key ${key}.`
      });
    }
  }

  if (requireUnitForQuantity) {
    const hasQuantity = normalizedRows.some((row) => Object.keys(row || {}).some((field) => /^(MENGE|QTY|QUANTITY|PSMNG|WEMNG)$/i.test(field)));
    const hasUnit = normalizedRows.some((row) => Object.keys(row || {}).some((field) => /^(MEINS|UNIT|UOM|GMEIN)$/i.test(field)));
    if (hasQuantity && !hasUnit) {
      issues.push({
        severity: "warning",
        code: "QUANTITY_WITHOUT_UNIT",
        message: `${tableName} includes quantity fields but no obvious unit field.`
      });
    }
  }

  return {
    tableName: String(tableName || "").toUpperCase(),
    ok: !issues.some((issue) => issue.severity === "error"),
    rowCount: normalizedRows.length,
    issues
  };
}
