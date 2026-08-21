import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { findSapTransportTarget, type SapTransportTarget } from "./transportTargetRepository.js";
import { transportTargetEnvironment, normalizeTargetSystem } from "./transportRequestService.js";

export type ReleaseTaskResult = {
  trkorr: string;
  trfunction: string;
  description: string;
  status: "PASS" | "ERROR" | "WARNING" | "RELEASED" | "SKIPPED";
  message: string;
  sequence: number;
  objects: ReleaseObjectResult[];
};

export type ReleaseObjectResult = {
  trkorr: string;
  pgmid: string;
  objectType: string;
  objectName: string;
  status: "PASS" | "ERROR" | "WARNING" | "RELEASED" | "SKIPPED";
  message: string;
  sequence: number;
  statusSource: "SAP" | "TASK";
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
    }, releaseRuntimeTimeoutMs(action, config.sap.transportRequestTimeoutMs));

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", async (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout || "{}") as Record<string, unknown>;
        if (classifyReleaseProcessResult(action, code, result) === "ERROR") {
          const error = serviceError(
            String(result.message || stderr || "SAP_CR_RELEASE_FAILED"),
            409
          );
          error.code = String(result.code || "SAP_CR_RELEASE_FAILED");
          return reject(error);
        }
        const parsed = result as unknown as ReleaseResult;
        try {
          resolve(await enrichReleaseResultWithObjects(parsed, normalizedTarget));
        } catch {
          resolve(parsed);
        }
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ trkorr, targetSystem: normalizedTarget }));
  });
}

export function releaseRuntimeTimeoutMs(
  action: "test-run" | "release",
  baseTimeoutMs: number
) {
  return action === "release" ? Math.max(baseTimeoutMs, 180_000) : baseTimeoutMs;
}

export function classifyReleaseProcessResult(
  action: "test-run" | "release",
  exitCode: number | null,
  result: Record<string, unknown>
): "RESULT" | "ERROR" {
  if (exitCode !== 0) return "ERROR";
  if (result.ok !== false) return "RESULT";

  const expectedMode = action === "test-run" ? "TEST_RUN" : "RELEASE";
  const isCompleteOperationResult = result.mode === expectedMode
    && Array.isArray(result.tasks)
    && result.tasks.length > 0;
  return isCompleteOperationResult ? "RESULT" : "ERROR";
}

type ReleaseObjectQuery = (
  sql: string,
  params: unknown[]
) => Promise<{ rows: Array<{ trkorr: string; pgmid: string | null; object_type: string | null; object_name: string | null }> }>;

export async function enrichReleaseResultWithObjects(
  result: ReleaseResult,
  targetSystem: string,
  query: ReleaseObjectQuery = (sql, params) => pool.query(sql, params)
): Promise<ReleaseResult> {
  const tasks = Array.isArray(result.tasks) ? result.tasks : [];
  const requestNumbers = [...new Set(tasks.map((task) => String(task.trkorr || "").trim()).filter(Boolean))];
  const sourceSystem = releaseObjectSourceSystem(targetSystem);
  const synchronized = requestNumbers.length
    ? await query(
      `SELECT trkorr, pgmid, object_type, object_name
       FROM cr_management.cr_objects
       WHERE sap_system_code = $1
         AND trkorr = ANY($2::text[])
       ORDER BY trkorr, position`,
      [sourceSystem, requestNumbers]
    )
    : { rows: [] };

  const synchronizedByRequest = new Map<string, ReleaseObjectResult[]>();
  for (const row of synchronized.rows) {
    const owner = tasks.find((task) => task.trkorr === row.trkorr);
    if (!owner) continue;
    const objects = synchronizedByRequest.get(row.trkorr) || [];
    objects.push({
      trkorr: row.trkorr,
      pgmid: String(row.pgmid || "").trim(),
      objectType: String(row.object_type || "").trim(),
      objectName: String(row.object_name || "").trim(),
      status: owner.status,
      message: `Inherited from task status: ${owner.message || owner.status}`,
      sequence: objects.length + 1,
      statusSource: "TASK"
    });
    synchronizedByRequest.set(row.trkorr, objects);
  }

  const enrichedTasks = tasks.map((task) => {
    const sapObjects = Array.isArray(task.objects) ? task.objects : [];
    const merged = new Map<string, ReleaseObjectResult>();
    for (const object of synchronizedByRequest.get(task.trkorr) || []) {
      merged.set(releaseObjectKey(object), object);
    }
    for (const object of sapObjects) {
      merged.set(releaseObjectKey(object), { ...object, statusSource: "SAP" });
    }
    const objects = [...merged.values()];
    const failedObject = objects.find((object) => object.status === "ERROR");
    return failedObject && task.status !== "ERROR"
      ? { ...task, status: "ERROR" as const, message: `Object validation failed: ${failedObject.message || failedObject.objectName}`, objects }
      : { ...task, objects };
  });
  const hasErrors = enrichedTasks.some((task) => task.status === "ERROR" || task.objects.some((object) => object.status === "ERROR"));

  return { ...result, ok: result.ok && !hasErrors, hasErrors, tasks: enrichedTasks };
}

function releaseObjectKey(object: Pick<ReleaseObjectResult, "trkorr" | "pgmid" | "objectType" | "objectName">) {
  return [object.trkorr, object.pgmid, object.objectType, object.objectName].map((value) => String(value || "").trim().toUpperCase()).join("|");
}

function releaseObjectSourceSystem(targetSystem: string) {
  const normalized = normalizeTargetSystem(targetSystem);
  return normalized === "TRD" || normalized === "DEV_AIX" || normalized.replace("_", " ").includes("AIX")
    ? "DEV"
    : normalized;
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
