import { assertSapServerEnabled, getSapBaseServerName, resolveSapServerName } from "./sap-landscape.mjs";

const PRIMARY_READ_RFC = [
  "RFC_READ_TABLE",
  "DDIF_FIELDINFO_GET",
  "DDIF_TABL_GET",
  "DD_DOMVALUES_GET",
  "RFC_GET_FUNCTION_INTERFACE",
  "TH_USER_LIST"
];

const ABAP_READ_RFC = [
  "RFC_READ_TABLE",
  "ZRFC_READ_REPORT",
  "ZRFC_SMARTFORM_GRAPHICS_READ",
  "RFC_GET_FUNCTION_INTERFACE",
  "TH_USER_LIST",
  "TR_READ_COMM",
  "TR_READ_GLOBAL_INFO_OF_REQUEST",
  "TMS_MGR_READ_TRANSPORT_REQUEST"
];

const MAINTENANCE_READ_RFC = [
  "RFC_READ_TABLE",
  "ZRFC_SMARTFORM_GRAPHICS_READ"
];

const DEFAULT_ALLOWED_RFC = {
  SAP_QA: PRIMARY_READ_RFC,
  SAP_PRD: PRIMARY_READ_RFC,
  SAP_DEV_AIX: ABAP_READ_RFC,
  SAP_DEV_NC: ABAP_READ_RFC,
  SAP_DEV_AIX_MAINT: MAINTENANCE_READ_RFC,
  SAP_DEV_NC_MAINT: MAINTENANCE_READ_RFC
};

const DEFAULT_BLOCKED_PATTERNS = [
  /^BAPI_.*_CREATE.*/i,
  /^BAPI_.*_CHANGE.*/i,
  /^BAPI_.*_DELETE.*/i,
  /^BAPI_.*_POST.*/i,
  /^BAPI_.*_RELEASE.*/i,
  /^BAPI_.*_CANCEL.*/i,
  /^BAPI_TRANSACTION_COMMIT$/i,
  /^BAPI_TRANSACTION_ROLLBACK$/i,
  /^RFC_ABAP_INSTALL_AND_RUN$/i,
  /^SXPG_COMMAND_EXECUTE$/i,
  /^JOB_OPEN$/i,
  /^JOB_SUBMIT$/i,
  /^JOB_CLOSE$/i
];

const LARGE_TABLES = new Set([
  "ACDOCA", "BSEG", "BKPF", "DD02L", "DD03L", "DD08L", "DD07L", "DD07T",
  "E070", "E070CREATE", "E07T", "E071", "E071K", "TPALOG", "MSEG", "MKPF", "EKKO", "EKPO", "EKBE",
  "MCHB", "AUFK", "AFPO", "QALS", "QAVE", "QAMR", "QASE", "COBK", "COEP",
  "VBAK", "VBAP", "LIKP", "LIPS", "TADIR", "TRDIR", "TSTC", "VBRK", "VBRP"
]);

const DEFAULT_ABAP_SOURCE_CONFIG_TABLES = new Set([
  "DD07L",
  "DD07T",
  "E070",
  "E070CREATE",
  "E07T",
  "E071",
  "E071K",
  "TLOGO",
  "TLOGOT",
  "TPALOG",
  "ZMAP_INDICATOR",
  "ZMAP_TYPE"
]);

const ABAP_SOURCE_SERVERS = new Set(["SAP_DEV_AIX", "SAP_DEV_NC"]);
const MAINTENANCE_SERVERS = new Set(["SAP_DEV_AIX_MAINT", "SAP_DEV_NC_MAINT"]);

export class ReadOnlyGuard {
  constructor({
    allowedRfc = DEFAULT_ALLOWED_RFC,
    blockedPatterns = DEFAULT_BLOCKED_PATTERNS,
    defaultRowLimit = 500,
    maxRowLimit = 5000,
    abapSourceConfigTables = DEFAULT_ABAP_SOURCE_CONFIG_TABLES,
    readOnlyMode = true
  } = {}) {
    this.allowedRfc = allowedRfc;
    this.blockedPatterns = blockedPatterns;
    this.defaultRowLimit = defaultRowLimit;
    this.maxRowLimit = maxRowLimit;
    this.abapSourceConfigTables = abapSourceConfigTables;
    this.readOnlyMode = readOnlyMode;
  }

  assertCanCall({ server, rfcName, params = {}, agentName = "unknown_agent" }) {
    const requestedServer = this.normalizeRequired(server, "server");
    const normalizedServer = resolveSapServerName(requestedServer);
    const normalizedRfc = this.normalizeRequired(rfcName, "rfcName");

    if (!this.readOnlyMode) {
      throw this.denied("READ_ONLY_MODE_DISABLED", normalizedServer, normalizedRfc, agentName);
    }

    assertSapServerEnabled(normalizedServer);

    if (this.blockedPatterns.some((pattern) => pattern.test(normalizedRfc))) {
      throw this.denied("RFC_BLOCKED_BY_PATTERN", normalizedServer, normalizedRfc, agentName);
    }

    const allowed = this.allowedRfc[normalizedServer] || [];
    if (!allowed.includes(normalizedRfc)) {
      throw this.denied("RFC_NOT_ALLOWLISTED", normalizedServer, normalizedRfc, agentName);
    }

    if (normalizedRfc === "RFC_READ_TABLE") {
      this.assertSafeTableRead({ server: normalizedServer, rfcName: normalizedRfc, params, agentName });
    }

    return {
      server: normalizedServer,
      requestedServer,
      baseServer: getSapBaseServerName(normalizedServer),
      rfcName: normalizedRfc,
      params: this.withSafeDefaults(normalizedRfc, params)
    };
  }

  assertSafeTableRead({ server, rfcName, params, agentName }) {
    const queryTable = this.normalizeRequired(params.QUERY_TABLE, "QUERY_TABLE");
    const rowCount = Number(params.ROWCOUNT ?? this.defaultRowLimit);
    const options = Array.isArray(params.OPTIONS) ? params.OPTIONS : [];
    const hasWhereClause = options.some((option) => String(option.TEXT || "").trim().length > 0);

    if (ABAP_SOURCE_SERVERS.has(server) && !this.abapSourceConfigTables.has(queryTable)) {
      throw this.denied("ABAP_SOURCE_TABLE_NOT_ALLOWLISTED", server, rfcName, agentName);
    }
    if (MAINTENANCE_SERVERS.has(server) &&
        (String(agentName).trim().toUpperCase() !== "SAP_ABAP_TECHNICAL_AGENT" || queryTable !== "TADIR")) {
      throw this.denied("MAINTENANCE_PREFLIGHT_ONLY", server, rfcName, agentName);
    }

    if (!Number.isInteger(rowCount) || rowCount < 1) {
      throw this.denied("INVALID_ROWCOUNT", server, rfcName, agentName);
    }

    if (rowCount > this.maxRowLimit) {
      throw this.denied("ROWCOUNT_EXCEEDS_MAX", server, rfcName, agentName);
    }

    if (LARGE_TABLES.has(queryTable) && !hasWhereClause) {
      throw this.denied("LARGE_TABLE_REQUIRES_WHERE", server, rfcName, agentName);
    }
  }

  withSafeDefaults(rfcName, params) {
    if (rfcName !== "RFC_READ_TABLE") return params;

    return {
      ROWCOUNT: this.defaultRowLimit,
      ...params
    };
  }

  normalizeRequired(value, name) {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) {
      throw new Error(`${name} is required`);
    }
    return normalized;
  }

  denied(code, server, rfcName, agentName) {
    const error = new Error(`SAP call denied: ${code}`);
    error.code = code;
    error.server = server;
    error.rfcName = rfcName;
    error.agentName = agentName;
    return error;
  }
}

