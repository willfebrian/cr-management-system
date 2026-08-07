import { pool } from "../db/pool.js";

export type SapTransportTarget = {
  code: string;
  server: string;
  client: string;
  sapUser: string;
  package: "ZTRD";
  host: string;
  systemNumber: string;
  password: string;
};

export async function findSapTransportTarget(code: string): Promise<SapTransportTarget | null> {
  const { rows } = await pool.query(`
    SELECT code, environment, host, system_number, client, rfc_user, rfc_password, is_active
    FROM sap_systems WHERE upper(code) = $1 LIMIT 1
  `, [code]);
  const row = rows[0];
  if (!row || row.is_active !== true) return null;
  const environment = String(row.environment || "").trim().toLowerCase();
  if (!["development", "sandbox"].includes(environment)) return null;
  const target = {
    code: String(row.code || "").trim().toUpperCase(),
    server: String(row.code || "").trim().toUpperCase(),
    client: String(row.client || "").trim(),
    sapUser: String(row.rfc_user || "").trim().toUpperCase(),
    package: "ZTRD" as const,
    host: String(row.host || "").trim(),
    systemNumber: String(row.system_number || "").trim().padStart(2, "0"),
    password: String(row.rfc_password || "")
  };
  if (!target.host || !target.client || !target.sapUser || !target.password) {
    if (["DEV_NC", "DEV_AIX"].includes(target.code)) return null;
    throw targetError("SAP_CR_CREATE_TARGET_CONNECTION_INCOMPLETE", 409);
  }
  if (target.sapUser !== "TRSTDEV") throw targetError("SAP_CR_CREATE_USER_MUST_BE_TRSTDEV", 403);
  return target;
}

function targetError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number; code?: string };
  error.status = status;
  error.code = message;
  return error;
}
