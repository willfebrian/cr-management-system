export const SAP_LANDSCAPE_SERVERS = {
  SAP_DEV_NC: {
    enabled: true,
    status: "active",
    envPrefixes: ["SAP_DEV_NC"],
    maintenanceEnvPrefixes: ["SAP_DEV_NC_MAINT", "SAP_DEV_NC"],
    capabilities: ["confirmed_sap_action", "abap_source_read", "abap_maintenance", "technical_config_read"]
  },
  SAP_DEV_AIX: {
    enabled: true,
    status: "active",
    envPrefixes: ["SAP_DEV_AIX", "SAP_ABAP"],
    maintenanceEnvPrefixes: ["SAP_DEV_AIX_MAINT", "SAP_ABAP_MAINT", "SAP_DEV_AIX", "SAP_ABAP"],
    capabilities: ["confirmed_sap_action", "abap_source_read", "abap_maintenance", "technical_config_read"]
  },
  SAP_QA: {
    enabled: true,
    status: "active",
    envPrefixes: ["SAP_QA", "SAP_PRIMARY"],
    maintenanceEnvPrefixes: [],
    capabilities: ["confirmed_sap_action", "business_data", "transaction_data", "master_data", "customizing_read", "ddic_metadata", "module_analysis", "repository_inventory"]
  },
  SAP_PRD: {
    enabled: true,
    status: "active",
    envPrefixes: ["SAP_PRD"],
    maintenanceEnvPrefixes: [],
    capabilities: ["business_data", "transaction_data", "master_data", "customizing_read", "ddic_metadata", "module_analysis", "repository_inventory"]
  }
};

export const SAP_MAINTENANCE_PROFILES = {
  SAP_DEV_AIX_MAINT: {
    enabled: true,
    status: "active",
    baseServer: "SAP_DEV_AIX",
    envPrefixes: ["SAP_DEV_AIX_MAINT", "SAP_ABAP_MAINT", "SAP_DEV_AIX", "SAP_ABAP"],
    capabilities: ["confirmed_sap_action", "abap_source_read", "abap_maintenance", "maintenance_preflight", "smartform_graphics_read"]
  },
  SAP_DEV_NC_MAINT: {
    enabled: false,
    status: "reserved",
    baseServer: "SAP_DEV_NC",
    envPrefixes: ["SAP_DEV_NC_MAINT", "SAP_DEV_NC"],
    capabilities: ["confirmed_sap_action", "abap_source_read", "abap_maintenance", "maintenance_preflight", "smartform_graphics_read"]
  }
};

export const SAP_SERVER_ALIASES = {
  SAP_PRIMARY: "SAP_QA",
  SAP_ABAP_SOURCE: "SAP_DEV_AIX",
  SAP_ABAP_MAINTENANCE: "SAP_DEV_AIX_MAINT"
};

export function normalizeSapName(value) {
  return String(value || "").trim().toUpperCase();
}

export function resolveSapServerName(server) {
  const normalized = normalizeSapName(server);
  return SAP_SERVER_ALIASES[normalized] || normalized;
}

export function getSapServerDefinition(server) {
  const resolved = resolveSapServerName(server);
  return SAP_MAINTENANCE_PROFILES[resolved] || SAP_LANDSCAPE_SERVERS[resolved] || null;
}

export function getSapBaseServerName(server) {
  const resolved = resolveSapServerName(server);
  return SAP_MAINTENANCE_PROFILES[resolved]?.baseServer || resolved;
}

export function isSapServerEnabled(server) {
  const definition = getSapServerDefinition(server);
  return Boolean(definition?.enabled);
}

export function assertSapServerEnabled(server) {
  const resolved = resolveSapServerName(server);
  const definition = getSapServerDefinition(resolved);
  if (!definition) {
    const error = new Error(`SAP_SERVER_UNKNOWN: ${server}`);
    error.code = "SAP_SERVER_UNKNOWN";
    error.server = resolved;
    throw error;
  }
  if (!definition.enabled) {
    const error = new Error(`SAP_SERVER_INACTIVE: ${resolved}`);
    error.code = "SAP_SERVER_INACTIVE";
    error.server = resolved;
    error.status = definition.status;
    throw error;
  }
  return resolved;
}

export function hasSapCapability(server, capability) {
  const definition = getSapServerDefinition(server);
  return Boolean(definition?.capabilities?.includes(capability));
}

export function getConnectionPrefixes(server, { maintenance = false } = {}) {
  const resolved = resolveSapServerName(server);
  const profile = SAP_MAINTENANCE_PROFILES[resolved];
  if (profile) return profile.envPrefixes;
  const definition = SAP_LANDSCAPE_SERVERS[resolved];
  if (!definition) return [];
  return maintenance ? definition.maintenanceEnvPrefixes : definition.envPrefixes;
}

export function hasCompleteConnectionEnv(prefix, env = process.env) {
  const direct = ["ASHOST", "SYSNR", "CLIENT", "USER", "PASSWORD"].every((suffix) => filled(env[`${prefix}_${suffix}`]));
  const loadBalanced = ["MSHOST", "R3NAME", "GROUP", "CLIENT", "USER", "PASSWORD"].every((suffix) => filled(env[`${prefix}_${suffix}`]));
  return direct || loadBalanced;
}

export function chooseConnectionPrefix(prefixes, env = process.env) {
  return prefixes.find((prefix) => hasCompleteConnectionEnv(prefix, env));
}

function filled(value) {
  return String(value || "").trim().length > 0;
}


