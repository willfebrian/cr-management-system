import { executeRelease, type ReleaseResult } from "./transportReleaseService.js";
import {
  claimReleaseOperation,
  createOrGetActiveReleaseOperation,
  findReleaseOperation,
  updateReleaseOperation,
  updateReleaseOperationSync,
  type ReleaseOperation,
  type ReleaseOperationStatus,
  type ReleaseOperationSyncStatus
} from "./transportReleaseOperationRepository.js";
import { runCrSync } from "../sync/crSyncRunner.js";
import { transportCreateSyncOptions } from "../sync/transportRequestSync.js";

type Schedule = (work: () => void) => void;

export type ReleaseOperationRunnerDependencies = {
  claim: (id: string) => Promise<ReleaseOperation | null>;
  update: typeof updateReleaseOperation;
  updateSync: typeof updateReleaseOperationSync;
  execute: (trkorr: string, targetSystem: string) => Promise<ReleaseResult>;
  sync: () => Promise<unknown>;
  schedule: Schedule;
};

type ReleaseOperationStartDependencies = ReleaseOperationRunnerDependencies & {
  createOrGet: typeof createOrGetActiveReleaseOperation;
};

const scheduleImmediate: Schedule = (work) => { setImmediate(work); };

const defaultDependencies: ReleaseOperationStartDependencies = {
  createOrGet: createOrGetActiveReleaseOperation,
  claim: claimReleaseOperation,
  update: updateReleaseOperation,
  updateSync: updateReleaseOperationSync,
  execute: executeRelease,
  sync: () => runCrSync(transportCreateSyncOptions()),
  schedule: scheduleImmediate
};

export async function startReleaseOperation(
  input: { trkorr: string; targetSystem: string },
  dependencies: ReleaseOperationStartDependencies = defaultDependencies
): Promise<ReleaseOperation> {
  const operation = await dependencies.createOrGet(input);
  if (operation.status === "queued") {
    dependencies.schedule(() => {
      void runReleaseOperation(operation.id, dependencies);
    });
  }
  return operation;
}

export async function getReleaseOperation(id: string): Promise<ReleaseOperation | null> {
  return findReleaseOperation(id);
}

export async function runReleaseOperation(
  id: string,
  dependencies: ReleaseOperationRunnerDependencies = defaultDependencies
): Promise<void> {
  const operation = await dependencies.claim(id);
  if (!operation) return;

  try {
    const result = await dependencies.execute(operation.trkorr, operation.targetSystem);
    if (!result.ok) {
      await dependencies.update(id, {
        status: "failed",
        phase: "verifying",
        message: result.message || "SAP_CR_RELEASE_FAILED",
        result
      });
      return;
    }

    await dependencies.update(id, {
      status: "succeeded",
      phase: "verifying",
      message: result.message || "RELEASE_COMPLETE",
      result,
      syncStatus: "queued"
    });
    dependencies.schedule(() => {
      void runReleaseSync(id, dependencies);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: ReleaseOperationStatus = /SAP_CR_RELEASE_TIMEOUT|timed?\s*out/i.test(message)
      ? "timed_out"
      : "failed";
    await dependencies.update(id, {
      status,
      phase: "verifying",
      message
    });
  }
}

export async function runReleaseSync(
  id: string,
  dependencies: Pick<ReleaseOperationRunnerDependencies, "updateSync" | "sync">
): Promise<void> {
  await dependencies.updateSync(id, "running", "CR synchronization is running in the background");
  try {
    const result = await dependencies.sync();
    const requestCount = Number((result as { requestCount?: number })?.requestCount || 0);
    await dependencies.updateSync(id, "succeeded", `CR synchronization completed (${requestCount} request(s))`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dependencies.updateSync(id, "failed", message);
  }
}

export function isReleaseOperationTerminal(status: ReleaseOperationStatus) {
  return status === "succeeded" || status === "failed" || status === "timed_out";
}

export function releaseOperationSyncMessage(status: ReleaseOperationSyncStatus) {
  return status === "queued" || status === "running"
    ? "CR data synchronization is running in the background."
    : "";
}
