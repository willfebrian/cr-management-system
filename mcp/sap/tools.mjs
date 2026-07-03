import { analyzeAbapSource, normalizeZrfcReadReportResult } from "./abap-source-analyzer.mjs";
import { planBusinessRead } from "./business-query-planner.mjs";
import {
  normalizeDomainValues,
  normalizeDomainTexts,
  normalizeDdicFieldCatalog,
  normalizeFieldInfo,
  normalizeForeignKeyRelationships,
  normalizeRepositoryLookup,
  normalizeRfcReadTable,
  normalizeTableDefinition
} from "./ddic-normalizer.mjs";

export function createSapTools(gateway) {
  return {
    sap_table_metadata: ({ agentName, server = "SAP_QA", tableName, userQuestion }) => {
      return gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD02L",
          DELIMITER: "|",
          FIELDS: ["TABNAME", "TABCLASS", "CONTFLAG", "MAINFLAG", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `TABNAME = '${tableName}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: 5
        },
        userQuestion
      });
    },

    sap_table_definition_normalized: async ({ agentName, server = "SAP_QA", tableName, userQuestion }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD02L",
          DELIMITER: "|",
          FIELDS: ["TABNAME", "TABCLASS", "CONTFLAG", "MAINFLAG", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `TABNAME = '${tableName}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: 5
        },
        userQuestion
      });
      return normalizeTableDefinition({ ...normalizeRfcReadTable(result), NAME: tableName });
    },

    sap_field_metadata: ({ agentName, server = "SAP_QA", tableName, userQuestion }) => {
      return gateway.call({
        agentName,
        server,
        rfcName: "DDIF_FIELDINFO_GET",
        params: { TABNAME: tableName },
        userQuestion
      });
    },

    sap_field_metadata_normalized: async ({ agentName, server = "SAP_QA", tableName, userQuestion }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "DDIF_FIELDINFO_GET",
        params: { TABNAME: tableName },
        userQuestion
      });
      return normalizeFieldInfo(result);
    },

    sap_domain_values: ({ agentName, server = "SAP_QA", domainName, userQuestion }) => {
      return gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD07L",
          DELIMITER: "|",
          FIELDS: ["DOMNAME", "VALPOS", "DOMVALUE_L", "DOMVALUE_H", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `DOMNAME = '${domainName}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: 100
        },
        userQuestion
      });
    },

    sap_domain_values_normalized: async ({ agentName, server = "SAP_QA", domainName, userQuestion }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD07L",
          DELIMITER: "|",
          FIELDS: ["DOMNAME", "VALPOS", "DOMVALUE_L", "DOMVALUE_H", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `DOMNAME = '${domainName}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: 100
        },
        userQuestion
      });
      const normalized = normalizeRfcReadTable(result);
      return normalizeDomainValues({
        DOMNAME: domainName,
        DD07V_TAB: normalized.rows.map((row) => ({
          DOMVALUE_L: row.DOMVALUE_L,
          DOMVALUE_H: row.DOMVALUE_H
        }))
      });
    },

    sap_domain_texts_normalized: async ({
      agentName,
      server = "SAP_QA",
      domainName,
      language = "E",
      rowCount = 100,
      userQuestion
    }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD07T",
          DELIMITER: "|",
          FIELDS: ["DOMNAME", "DDLANGUAGE", "DOMVALUE_L", "DDTEXT", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `DOMNAME = '${domainName}' AND DDLANGUAGE = '${language}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: rowCount
        },
        userQuestion
      });
      return normalizeDomainTexts(result, domainName);
    },

    sap_field_catalog_fallback: async ({
      agentName,
      server = "SAP_QA",
      tableName,
      rowCount = 500,
      userQuestion
    }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD03L",
          DELIMITER: "|",
          FIELDS: ["TABNAME", "FIELDNAME", "POSITION", "KEYFLAG", "ROLLNAME", "CHECKTABLE", "NOTNULL", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `TABNAME = '${tableName}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: rowCount
        },
        userQuestion
      });
      return normalizeDdicFieldCatalog(result);
    },

    sap_table_read_limited: ({
      agentName,
      server = "SAP_QA",
      tableName,
      fields = [],
      where = [],
      rowCount,
      userQuestion
    }) => {
      return gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: tableName,
          FIELDS: fields.map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: where.map((TEXT) => ({ TEXT })),
          ROWCOUNT: rowCount
        },
        userQuestion
      });
    },

    sap_table_read_limited_normalized: async ({
      agentName,
      server = "SAP_QA",
      tableName,
      fields = [],
      where = [],
      rowCount,
      delimiter = "|",
      userQuestion
    }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: tableName,
          DELIMITER: delimiter,
          FIELDS: fields.map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: where.map((TEXT) => ({ TEXT })),
          ROWCOUNT: rowCount
        },
        userQuestion
      });
      return normalizeRfcReadTable(result);
    },

    sap_business_read_limited: async ({
      agentName,
      moduleName,
      tableName,
      filters,
      fields = [],
      rowCount = 100,
      userQuestion
    }) => {
      const plan = planBusinessRead({ moduleName, tableName, filters, fields, rowCount });
      if (!plan.ok) {
        const error = new Error(`Business read denied: ${plan.code}`);
        error.code = plan.code;
        error.details = plan;
        throw error;
      }

      const result = await gateway.call({
        agentName,
        server: "SAP_QA",
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: plan.tableName,
          DELIMITER: "|",
          FIELDS: plan.fields.map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: plan.where.map((TEXT) => ({ TEXT })),
          ROWCOUNT: plan.rowCount
        },
        userQuestion
      });

      return {
        plan,
        result: normalizeRfcReadTable(result)
      };
    },

    sap_repository_lookup: ({
      agentName = "sap_data_dictionary_agent",
      server = "SAP_QA",
      pgmid = "R3TR",
      objectType,
      objectName,
      rowCount = 5,
      userQuestion
    }) => {
      return gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "TADIR",
          DELIMITER: "|",
          FIELDS: ["PGMID", "OBJECT", "OBJ_NAME", "DEVCLASS", "SRCSYSTEM"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [
            { TEXT: `PGMID = '${pgmid}' AND OBJECT = '${objectType}' AND OBJ_NAME = '${objectName}'` }
          ],
          ROWCOUNT: rowCount
        },
        userQuestion
      });
    },

    sap_repository_lookup_normalized: async ({
      agentName = "sap_data_dictionary_agent",
      server = "SAP_QA",
      pgmid = "R3TR",
      objectType,
      objectName,
      rowCount = 5,
      userQuestion
    }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "TADIR",
          DELIMITER: "|",
          FIELDS: ["PGMID", "OBJECT", "OBJ_NAME", "DEVCLASS", "SRCSYSTEM"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [
            { TEXT: `PGMID = '${pgmid}' AND OBJECT = '${objectType}' AND OBJ_NAME = '${objectName}'` }
          ],
          ROWCOUNT: rowCount
        },
        userQuestion
      });
      return normalizeRepositoryLookup(result);
    },

    sap_tcode_lookup: async ({
      agentName = "sap_data_dictionary_agent",
      server = "SAP_QA",
      tcode,
      userQuestion
    }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "TSTC",
          DELIMITER: "|",
          FIELDS: ["TCODE", "PGMNA", "DYPNO", "CINFO"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `TCODE = '${String(tcode).toUpperCase()}'` }],
          ROWCOUNT: 5
        },
        userQuestion
      });
      return normalizeRfcReadTable(result);
    },

    sap_foreign_key_relationships: async ({
      agentName = "sap_data_dictionary_agent",
      server = "SAP_QA",
      tableName,
      rowCount = 500,
      userQuestion
    }) => {
      const result = await gateway.call({
        agentName,
        server,
        rfcName: "RFC_READ_TABLE",
        params: {
          QUERY_TABLE: "DD08L",
          DELIMITER: "|",
          FIELDS: ["TABNAME", "FIELDNAME", "CHECKTABLE", "AS4LOCAL"].map((FIELDNAME) => ({ FIELDNAME })),
          OPTIONS: [{ TEXT: `TABNAME = '${tableName}' AND AS4LOCAL = 'A'` }],
          ROWCOUNT: rowCount
        },
        userQuestion
      });
      return normalizeForeignKeyRelationships(result);
    },

    z_read_abap_report: ({ agentName = "sap_abap_technical_agent", programName, userQuestion }) => {
      return gateway.call({
        agentName,
        server: "SAP_DEV_AIX",
        rfcName: "ZRFC_READ_REPORT",
        params: { PROGRAM: programName },
        userQuestion
      });
    },

    z_analyze_abap_report: async ({ agentName = "sap_abap_technical_agent", programName, userQuestion }) => {
      const rawResult = await gateway.call({
        agentName,
        server: "SAP_DEV_AIX",
        rfcName: "ZRFC_READ_REPORT",
        params: { PROGRAM: programName },
        userQuestion
      });

      const normalized = normalizeZrfcReadReportResult(rawResult);
      const analysis = analyzeAbapSource(normalized.sourceLines);

      return {
        system: normalized.system,
        program: normalized.program || programName,
        lineCount: normalized.lineCount,
        analysis
      };
    },

    z_resolve_abap_includes: async ({
      agentName = "sap_abap_technical_agent",
      programName,
      maxDepth = 2,
      userQuestion
    }) => {
      const visited = new Set();
      const queue = [{ programName, depth: 0, parent: null }];
      const resolved = [];
      const failures = [];

      while (queue.length > 0) {
        const item = queue.shift();
        const normalizedName = String(item.programName || "").toUpperCase();
        if (!normalizedName || visited.has(normalizedName) || item.depth > maxDepth) continue;

        visited.add(normalizedName);

        try {
          const rawResult = await gateway.call({
            agentName,
            server: "SAP_DEV_AIX",
            rfcName: "ZRFC_READ_REPORT",
            params: { PROGRAM: normalizedName },
            userQuestion
          });
          const normalized = normalizeZrfcReadReportResult(rawResult);
          const analysis = analyzeAbapSource(normalized.sourceLines);

          resolved.push({
            program: normalized.program || normalizedName,
            parent: item.parent,
            depth: item.depth,
            lineCount: normalized.lineCount,
            includes: analysis.includes
          });

          for (const include of analysis.includes) {
            queue.push({ programName: include.value, depth: item.depth + 1, parent: normalizedName });
          }
        } catch (error) {
          failures.push({
            program: normalizedName,
            parent: item.parent,
            depth: item.depth,
            message: error.message,
            code: error.code,
            key: error.key
          });
        }
      }

      return {
        rootProgram: programName,
        maxDepth,
        resolvedCount: resolved.length,
        failureCount: failures.length,
        resolved,
        failures
      };
    }
  };
}


