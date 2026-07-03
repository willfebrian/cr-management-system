import { ensureSapNwRfcSdkOnPath } from "./sap-sdk-path.mjs";
import {
  chooseConnectionPrefix,
  getConnectionPrefixes,
  resolveSapServerName
} from "./sap-landscape.mjs";

export const SAP_GATEWAY_CALL_CONTEXT = Symbol("SAP_GATEWAY_CALL_CONTEXT");

export function buildSapConnectionFromEnv(prefix, env = process.env) {
  const direct = {
    ashost: env[`${prefix}_ASHOST`],
    sysnr: env[`${prefix}_SYSNR`],
    client: env[`${prefix}_CLIENT`],
    user: env[`${prefix}_USER`],
    passwd: env[`${prefix}_PASSWORD`],
    lang: env[`${prefix}_LANG`] || "EN"
  };

  const loadBalanced = {
    mshost: env[`${prefix}_MSHOST`],
    r3name: env[`${prefix}_R3NAME`],
    group: env[`${prefix}_GROUP`],
    client: env[`${prefix}_CLIENT`],
    user: env[`${prefix}_USER`],
    passwd: env[`${prefix}_PASSWORD`],
    lang: env[`${prefix}_LANG`] || "EN"
  };

  if (direct.ashost && direct.sysnr && direct.client && direct.user && direct.passwd) {
    return direct;
  }

  if (loadBalanced.mshost && loadBalanced.r3name && loadBalanced.group && loadBalanced.client && loadBalanced.user && loadBalanced.passwd) {
    return loadBalanced;
  }

  throw new Error(`Incomplete SAP connection environment for prefix ${prefix}`);
}

export function buildSapConnectionFromPrefixes(prefixes, env = process.env) {
  const prefix = chooseConnectionPrefix(prefixes, env);
  if (!prefix) {
    throw new Error(`Incomplete SAP connection environment for prefixes ${prefixes.join(", ")}`);
  }
  return { prefix, connection: buildSapConnectionFromEnv(prefix, env) };
}

export class SapRfcClient {
  constructor({ serverName, connection, envPrefix }) {
    this.serverName = serverName;
    this.connection = connection;
    this.envPrefix = envPrefix;
    this.Client = null;
  }

  async call(rfcName, params, context) {
    if (context !== SAP_GATEWAY_CALL_CONTEXT) {
      const error = new Error("Direct SAP client calls are prohibited; use SapGateway");
      error.code = "DIRECT_SAP_CLIENT_CALL_BLOCKED";
      throw error;
    }
    ensureSapNwRfcSdkOnPath();

    if (!this.Client) {
      const nodeRfc = await import("node-rfc");
      this.Client = nodeRfc.Client;
    }

    const client = new this.Client(this.connection);

    try {
      await client.open();
      return await client.call(rfcName, params);
    } finally {
      if (client.alive) {
        client.close();
      }
    }
  }
}

export function createSapClientForServer(serverName, env = process.env) {
  const resolvedServer = resolveSapServerName(serverName);
  const prefixes = getConnectionPrefixes(resolvedServer);
  const { prefix, connection } = buildSapConnectionFromPrefixes(prefixes, env);
  return new SapRfcClient({ serverName: resolvedServer, connection, envPrefix: prefix });
}

export function createSapClients(env = process.env) {
  const clients = {};
  for (const serverName of ["SAP_QA", "SAP_DEV_AIX", "SAP_PRD", "SAP_DEV_NC"]) {
    try {
      clients[serverName] = createSapClientForServer(serverName, env);
    } catch {
      // Reserved or not-yet-configured servers are intentionally optional.
    }
  }

  try {
    clients.SAP_DEV_AIX_MAINT = createSapMaintenanceReadClient(env, "SAP_DEV_AIX_MAINT");
  } catch {
    // Dedicated maintenance profile is optional; fallback below keeps legacy reads alive.
  }

  if (!clients.SAP_DEV_AIX_MAINT && clients.SAP_DEV_AIX) clients.SAP_DEV_AIX_MAINT = clients.SAP_DEV_AIX;

  if (clients.SAP_QA) clients.SAP_PRIMARY = clients.SAP_QA;
  if (clients.SAP_DEV_AIX) clients.SAP_ABAP_SOURCE = clients.SAP_DEV_AIX;
  if (clients.SAP_DEV_AIX_MAINT) clients.SAP_ABAP_MAINTENANCE = clients.SAP_DEV_AIX_MAINT;

  return clients;
}

export function createSapMaintenanceReadClient(env = process.env, serverName = "SAP_DEV_AIX_MAINT") {
  const resolvedServer = resolveSapServerName(serverName);
  const prefixes = getConnectionPrefixes(resolvedServer, { maintenance: true });
  const { prefix, connection } = buildSapConnectionFromPrefixes(prefixes, env);
  return new SapRfcClient({ serverName: resolvedServer, connection, envPrefix: prefix });
}
