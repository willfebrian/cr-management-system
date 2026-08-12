import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { findSapTransportTarget, type SapTransportTarget } from "./transportTargetRepository.js";
import { transportTargetEnvironment, normalizeTargetSystem } from "./transportRequestService.js";

export type ReleaseTaskResult = {
  trkorr: string;
  trfunction: string;
  description: string;
  status: "PASS" | "ERROR" | "WARNING" | "RELEASED" | "SKIPPED";
  message: string;
  sequence: number;
};

export type ReleaseResult = {
  ok: boolean;
  message: string;
  mode: string;
  trkorr: string;
  targetSystem: string;
  targetServer: string;
  hasErrors: boolean;
  hasWarnings: boolean;
  tasks: ReleaseTaskResult[];
};

export async function testRunRelease(trkorr: string, targetSystem?: string): Promise<ReleaseResult> {
  return runReleasePlatform("test-run", trkorr, targetSystem);
}

export async function executeRelease(trkorr: string, targetSystem?: string): Promise<ReleaseResult> {
  return runReleasePlatform("release", trkorr, targetSystem);
}

async function runReleasePlatform(
  action: "test-run" | "release",
  trkorr: string,
  targetSystem?: string
): Promise<ReleaseResult> {
  const { cwd, script } = resolveReleaseRuntime();
  if (!fs.existsSync(script)) throw serviceError("SAP_CR_RELEASE_SCRIPT_NOT_FOUND", 503);

  const normalizedTarget = normalizeTargetSystem(targetSystem || "DEV_AIX");
  const databaseTarget = await findSapTransportTarget(normalizedTarget);
  if (!databaseTarget && !["DEV_NC", "DEV_AIX"].includes(normalizedTarget)) {
    throw serviceError("SAP_CR_RELEASE_TARGET_NOT_FOUND", 404);
  }
  const targetEnv = databaseTarget ? transportTargetEnvironment(databaseTarget) : {};

  return new Promise<ReleaseResult>((resolve, reject) => {
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
      reject(serviceError("SAP_CR_RELEASE_TIMEOUT", 504));
    }, config.sap.transportRequestTimeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout || "{}") as Record<string, unknown>;
        if (code !== 0 || result.ok === false) {
          const error = serviceError(
            String(result.message || stderr || "SAP_CR_RELEASE_FAILED"),
            409
          );
          error.code = String(result.code || "SAP_CR_RELEASE_FAILED");
          return reject(error);
        }
        resolve(result as unknown as ReleaseResult);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ trkorr, targetSystem: normalizedTarget }));
  });
}

function resolveReleaseRuntime() {
  const cwd = fileURLToPath(new URL("../../../", import.meta.url));
  return { cwd, script: path.join(cwd, "scripts", "cr-transport-release.mjs") };
}

function serviceError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number; code?: string };
  error.status = status;
  return error;
}
