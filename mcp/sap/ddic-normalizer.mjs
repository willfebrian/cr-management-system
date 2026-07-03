export function normalizeFieldInfo(result) {
  const fields = Array.isArray(result?.DFIES_TAB) ? result.DFIES_TAB : [];

  return {
    tableName: result?.TABNAME,
    objectType: result?.DDOBJTYPE,
    fieldCount: fields.length,
    fields: fields.map((field) => ({
      fieldName: field.FIELDNAME,
      position: Number(field.POSITION || 0),
      keyFlag: field.KEYFLAG === "X",
      dataElement: field.ROLLNAME,
      domainName: field.DOMNAME,
      dataType: field.DATATYPE,
      intType: field.INTTYPE,
      length: Number(field.LENG || 0),
      decimals: Number(field.DECIMALS || 0),
      checkTable: field.CHECKTABLE,
      fieldText: field.FIELDTEXT,
      repText: field.REPTEXT
    }))
  };
}

export function normalizeTableDefinition(result) {
  if (Array.isArray(result?.rows)) {
    const row = result.rows[0] || {};
    return {
      tableName: row.TABNAME || result.NAME,
      tableClass: row.TABCLASS,
      deliveryClass: row.CONTFLAG,
      maintenanceAllowed: row.MAINFLAG,
      activationState: row.AS4LOCAL,
      fieldCount: undefined,
      fields: []
    };
  }

  const fields = Array.isArray(result?.DD03P_TAB) ? result.DD03P_TAB : [];

  return {
    tableName: result?.DD02V_WA?.TABNAME || result?.NAME,
    tableClass: result?.DD02V_WA?.TABCLASS,
    deliveryClass: result?.DD02V_WA?.CONTFLAG,
    maintenanceAllowed: result?.DD02V_WA?.MAINFLAG,
    description: result?.DD02V_WA?.DDTEXT,
    fieldCount: fields.length,
    fields: fields.map((field) => ({
      fieldName: field.FIELDNAME,
      position: Number(field.POSITION || 0),
      keyFlag: field.KEYFLAG === "X",
      dataElement: field.ROLLNAME,
      dataType: field.DATATYPE,
      length: Number(field.LENG || 0),
      decimals: Number(field.DECIMALS || 0),
      description: field.DDTEXT
    }))
  };
}

export function normalizeDomainValues(result) {
  const values = Array.isArray(result?.DD07V_TAB) ? result.DD07V_TAB : [];

  return {
    domainName: result?.DOMNAME,
    valueCount: values.length,
    values: values.map((value) => ({
      low: value.DOMVALUE_L,
      high: value.DOMVALUE_H,
      text: value.DDTEXT,
      language: value.DDLANGUAGE
    }))
  };
}

export function normalizeDdicFieldCatalog(result) {
  const normalized = normalizeRfcReadTable(result);

  return {
    tableName: normalized.rows[0]?.TABNAME,
    fieldCount: normalized.rows.length,
    fields: normalized.rows.map((row) => ({
      tableName: row.TABNAME,
      fieldName: row.FIELDNAME,
      position: Number(row.POSITION || 0),
      keyFlag: row.KEYFLAG === "X",
      dataElement: row.ROLLNAME,
      checkTable: row.CHECKTABLE,
      notNull: row.NOTNULL === "X",
      activationState: row.AS4LOCAL
    }))
  };
}

export function normalizeDomainTexts(result, domainName) {
  const normalized = normalizeRfcReadTable(result);

  return {
    domainName,
    textCount: normalized.rows.length,
    texts: normalized.rows.map((row) => ({
      value: row.DOMVALUE_L,
      language: row.DDLANGUAGE,
      text: row.DDTEXT
    }))
  };
}

export function normalizeRepositoryLookup(result) {
  const normalized = normalizeRfcReadTable(result);

  return {
    objectCount: normalized.rows.length,
    objects: normalized.rows.map((row) => ({
      pgmid: row.PGMID,
      objectType: row.OBJECT,
      objectName: row.OBJ_NAME,
      packageName: row.DEVCLASS,
      sourceSystem: row.SRCSYSTEM
    }))
  };
}

export function normalizeForeignKeyRelationships(result) {
  const normalized = normalizeRfcReadTable(result);

  return {
    relationshipCount: normalized.rows.length,
    relationships: normalized.rows.map((row) => ({
      tableName: row.TABNAME,
      fieldName: row.FIELDNAME,
      checkTable: row.CHECKTABLE,
      foreignKeyName: row.FORTABLE || row.FORKTABLE || row.CONNAME,
      activationState: row.AS4LOCAL
    }))
  };
}

export function normalizeRfcReadTable(result) {
  const fields = Array.isArray(result?.FIELDS) ? result.FIELDS : [];
  const rows = Array.isArray(result?.DATA) ? result.DATA : [];
  const delimiter = result?.DELIMITER || "";

  return {
    tableName: result?.QUERY_TABLE,
    rowCount: rows.length,
    fields: fields.map((field) => ({
      fieldName: field.FIELDNAME,
      offset: Number(field.OFFSET || 0),
      length: Number(field.LENGTH || 0),
      type: field.TYPE,
      text: field.FIELDTEXT
    })),
    rows: rows.map((row) => parseReadTableRow(row.WA || "", fields, delimiter))
  };
}

function parseReadTableRow(raw, fields, delimiter) {
  if (delimiter) {
    const values = raw.split(delimiter);
    return Object.fromEntries(fields.map((field, index) => [field.FIELDNAME, values[index]?.trim() || ""]));
  }

  return Object.fromEntries(fields.map((field) => {
    const offset = Number(field.OFFSET || 0);
    const length = Number(field.LENGTH || 0);
    return [field.FIELDNAME, raw.slice(offset, offset + length).trim()];
  }));
}
