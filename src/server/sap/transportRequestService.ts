import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

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
};

export async function resolveTransportObject(query: string) {
  return runPlatform("resolve", { query: String(query || "").trim() });
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
  return { description, objects };
}

async function runPlatform(action: "resolve" | "preflight" | "create", payload: unknown) {
  const cwd = config.sap.transportRequestPlatformDir || config.sap.externalPlatformDir;
  if (!cwd) throw serviceError("SAP_CR_CREATE_PLATFORM_DIR_REQUIRED", 503);
  const script = path.join(cwd, "scripts", "cr-transport-request.mjs");
  if (!fs.existsSync(script)) throw serviceError("SAP_CR_CREATE_SCRIPT_NOT_FOUND", 503);

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(process.execPath, [script, action], {
      cwd,
      env: process.env,
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

function serviceError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number; code?: string };
  error.status = status;
  return error;
}
