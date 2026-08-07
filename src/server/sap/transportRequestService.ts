import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { findSapTransportTarget, type SapTransportTarget } from "./transportTargetRepository.js";

export type TransportObject = {
  pgmid: string;
  objectType: string;
  objectName: string;
  sourcePackage: string;
  targetPackage: "ZTRD";
  locked?: boolean;
  lockOrder?: string;
  lockUser?: string;
};

export type TransportRequestPayload = {
  description: string;
  objects: TransportObject[];
  confirmed?: boolean;
  targetSystem?: TransportTargetSystem;
};

export type TransportTargetSystem = string;

export function normalizeTargetSystem(value: unknown): TransportTargetSystem {
  return String(value || "DEV_NC").trim().toUpperCase() || "DEV_NC";
}

export async function resolveTransportObject(query: string, targetSystem: unknown = "DEV_NC") {
  return runPlatform("resolve", { query: String(query || "").trim(), targetSystem: normalizeTargetSystem(targetSystem) });
}

export async function preflightTransportRequest(payload: TransportRequestPayload) {
  return runPlatform("preflight", normalizePayload(payload));
}

export async function createTransportRequest(payload: TransportRequestPayload) {
  return runPlatform("create", { ...normalizePayload(payload), confirmed: payload.confirmed === true });
}

function normalizePayload(payload: TransportRequestPayload) {
  const description = String(payload?.description || "").trim();
  const objects = Array.isArray(payload?.objects) ? payload.objects.map((item) => ({
    pgmid: String(item.pgmid || "").trim().toUpperCase(),
    objectType: String(item.objectType || "").trim().toUpperCase(),
    objectName: String(item.objectName || "").trim().toUpperCase(),
    sourcePackage: String(item.sourcePackage || "").trim().toUpperCase(),
    targetPackage: "ZTRD" as const
  })) : [];
  return { description, objects, targetSystem: normalizeTargetSystem(payload?.targetSystem) };
}

async function runPlatform(action: "resolve" | "preflight" | "create", payload: unknown) {
  const { cwd, script } = resolveTransportRequestRuntime();
  if (!fs.existsSync(script)) throw serviceError("SAP_CR_CREATE_SCRIPT_NOT_FOUND", 503);
  const targetSystem = normalizeTargetSystem((payload as { targetSystem?: unknown })?.targetSystem);
  const databaseTarget = await findSapTransportTarget(targetSystem);
  if (!databaseTarget && !["DEV_NC", "DEV_AIX"].includes(targetSystem)) throw serviceError("SAP_CR_CREATE_TARGET_NOT_FOUND", 404);
  const targetEnv = databaseTarget ? transportTargetEnvironment(databaseTarget) : {};

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(process.execPath, [script, action], {
      cwd,
      env: { ...process.env, ...targetEnv },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(serviceError("SAP_CR_CREATE_TIMEOUT", 504));
    }, config.sap.transportRequestTimeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout || "{}") as Record<string, unknown>;
        if (code !== 0 || result.ok === false) {
          const error = serviceError(String(result.message || stderr || "SAP_CR_CREATE_FAILED"), 409);
          error.code = String(result.code || "SAP_CR_CREATE_FAILED");
          return reject(error);
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export function transportTargetEnvironment(target: SapTransportTarget): NodeJS.ProcessEnv {
  return {
    SAP_CR_TARGET_CODE: target.code,
    SAP_CR_TARGET_SERVER: target.server,
    SAP_CR_TARGET_CLIENT: target.client,
    SAP_CR_TARGET_USER: target.sapUser,
    SAP_CR_TARGET_PACKAGE: target.package,
    SAP_CR_TARGET_ASHOST: target.host,
    SAP_CR_TARGET_SYSNR: target.systemNumber,
    SAP_CR_TARGET_PASSWORD: target.password,
    SAP_CR_TARGET_LANG: "EN"
  };
}

export function resolveTransportRequestRuntime() {
  const cwd = fileURLToPath(new URL("../../../", import.meta.url));
  return { cwd, script: path.join(cwd, "scripts", "cr-transport-request.mjs") };
}


function serviceError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number; code?: string };
  error.status = status;
  return error;
}
