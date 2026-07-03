import { semanticLayer } from "../../config/semantic-layer.mjs";
import { sensitivePolicy } from "../../config/sensitive-data-policy.mjs";

export function planBusinessRead({ moduleName, tableName, filters, fields = [], rowCount = 100 }) {
  const normalizedModule = String(moduleName || "").toUpperCase();
  const normalizedTable = String(tableName || "").toUpperCase();
  const tableConfig = semanticLayer.modules?.[normalizedModule]?.tables?.[normalizedTable];

  if (!tableConfig) {
    return denied("UNKNOWN_SEMANTIC_TABLE", `${normalizedModule}.${normalizedTable} is not registered in the semantic layer.`);
  }

  const normalizedFilters = normalizeFilters(filters);
  const filterKeys = new Set(normalizedFilters.map((filter) => filter.field));
  const matchedFilterSet = (tableConfig.mandatory_filters_any || []).find((requiredSet) =>
    requiredSet.every((field) => filterKeys.has(field))
  );

  if (!matchedFilterSet) {
    return denied(
      "MANDATORY_FILTERS_NOT_MET",
      `${normalizedTable} requires one of these filter sets: ${JSON.stringify(tableConfig.mandatory_filters_any)}.`
    );
  }

  const sensitivity = evaluateSensitivity(normalizedTable, fields);
  if (sensitivity.denied) {
    return denied("SENSITIVE_TABLE_DENIED", `${normalizedTable} is denied by sensitive data policy.`);
  }

  const safeRowCount = Number(rowCount);
  if (!Number.isInteger(safeRowCount) || safeRowCount < 1 || safeRowCount > 500) {
    return denied("INVALID_BUSINESS_ROWCOUNT", "Business reads must use rowCount between 1 and 500.");
  }

  const selectedFields = fields.length ? fields.map((field) => String(field).toUpperCase()) : tableConfig.key_fields;

  return {
    ok: true,
    moduleName: normalizedModule,
    tableName: normalizedTable,
    role: tableConfig.role,
    rowCount: safeRowCount,
    fields: selectedFields,
    where: [normalizedFilters.map(formatFilter).join(" AND ")],
    matchedMandatoryFilterSet: matchedFilterSet,
    sensitivity
  };
}

export function normalizeFilters(filters = {}) {
  if (Array.isArray(filters)) {
    return filters.map((filter) => ({
      field: String(filter.field || "").toUpperCase(),
      operator: String(filter.operator || "=").toUpperCase(),
      value: String(filter.value ?? "")
    })).filter((filter) => filter.field && filter.value);
  }

  return Object.entries(filters).map(([field, value]) => ({
    field: String(field).toUpperCase(),
    operator: "=",
    value: String(value ?? "")
  })).filter((filter) => filter.field && filter.value);
}

function evaluateSensitivity(tableName, fields) {
  const deniedTables = new Set((sensitivePolicy.denied_tables || []).map((table) => table.toUpperCase()));
  const restrictedTables = new Set((sensitivePolicy.restricted_tables || []).map((table) => table.toUpperCase()));
  const patterns = sensitivePolicy.sensitive_field_patterns || [];
  const sensitiveFields = fields
    .map((field) => String(field).toUpperCase())
    .filter((field) => patterns.some((pattern) => field.includes(pattern.toUpperCase())));

  return {
    denied: deniedTables.has(tableName),
    restricted: restrictedTables.has(tableName) || sensitiveFields.length > 0,
    sensitiveFields
  };
}

function formatFilter(filter) {
  const value = filter.value.replaceAll("'", "''");
  if (filter.operator !== "=") {
    throw new Error(`Unsupported filter operator: ${filter.operator}`);
  }
  return `${filter.field} = '${value}'`;
}

function denied(code, message) {
  return {
    ok: false,
    code,
    message
  };
}
