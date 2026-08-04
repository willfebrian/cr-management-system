import {
  countLegacyTransportLifecycleCandidates,
  downgradeLegacyTransportLifecycle,
  listLegacyTransportLifecycleCandidates,
  upsertConfirmedTransportLogs,
  validateConfirmedTransportStepConstraint,
  type LegacyTransportLifecycleCandidate
} from "../db/crRepository.js";
import {
  readTransportImportLogsByRequest,
  type TransportImportLog
} from "../sap/crExtractor.js";
import { dedupeLatestConfirmedImportLogs } from "./transportLifecyclePolicy.js";

export type TransportTargetSystemCode = "QA" | "PRD";

export type TransportLifecycleReconciliationDependencies = {
  listCandidates: (
    targetSystemCode: TransportTargetSystemCode,
    limit: number
  ) => Promise<LegacyTransportLifecycleCandidate[]>;
  readLogsByRequest: (options: {
    targetSystemCode: TransportTargetSystemCode;
    trkorr: string;
    rowCount?: number;
  }) => Promise<TransportImportLog[]>;
  upsertConfirmed: typeof upsertConfirmedTransportLogs;
  downgrade: typeof downgradeLegacyTransportLifecycle;
  countUnresolved: typeof countLegacyTransportLifecycleCandidates;
  validateConstraint: typeof validateConfirmedTransportStepConstraint;
};

export type LifecycleReconciliationDecision = {
  trkorr: string;
  action: "confirm" | "downgrade" | "failed";
  message: string;
};

export type LifecycleReconciliationTargetResult = {
  targetSystemCode: TransportTargetSystemCode;
  candidates: number;
  confirmed: number;
  downgraded: number;
  failed: number;
  decisions: LifecycleReconciliationDecision[];
};

const defaultDependencies: TransportLifecycleReconciliationDependencies = {
  listCandidates: listLegacyTransportLifecycleCandidates,
  readLogsByRequest: readTransportImportLogsByRequest,
  upsertConfirmed: upsertConfirmedTransportLogs,
  downgrade: downgradeLegacyTransportLifecycle,
  countUnresolved: countLegacyTransportLifecycleCandidates,
  validateConstraint: validateConfirmedTransportStepConstraint
};

export async function reconcileLegacyTransportLifecycle(
  options: {
    targetSystemCodes: TransportTargetSystemCode[];
    limitPerTarget: number;
    dryRun?: boolean;
  },
  dependencies: TransportLifecycleReconciliationDependencies = defaultDependencies
) {
  const dryRun = Boolean(options.dryRun);
  const limit = Math.max(0, Math.floor(Number(options.limitPerTarget || 0)));
  const targets: LifecycleReconciliationTargetResult[] = [];

  for (const targetSystemCode of normalizeTargets(options.targetSystemCodes)) {
    const candidates = limit
      ? await dependencies.listCandidates(targetSystemCode, limit)
      : [];
    const result: LifecycleReconciliationTargetResult = {
      targetSystemCode,
      candidates: candidates.length,
      confirmed: 0,
      downgraded: 0,
      failed: 0,
      decisions: []
    };

    for (const candidate of candidates) {
      try {
        const logs = await dependencies.readLogsByRequest({
          targetSystemCode,
          trkorr: candidate.trkorr,
          rowCount: 50
        });
        const { accepted } = dedupeLatestConfirmedImportLogs(logs);

        if (accepted.length) {
          if (!dryRun) {
            const upsert = await dependencies.upsertConfirmed(targetSystemCode, accepted);
            if (upsert.processed < 1) {
              throw new Error("Confirmed import could not be persisted for the DEV parent CR.");
            }
          }
          result.confirmed += 1;
          result.decisions.push({
            trkorr: candidate.trkorr,
            action: "confirm",
            message: `Valid TPALOG step I found on ${targetSystemCode}.`
          });
          continue;
        }

        const changed = dryRun || await dependencies.downgrade(
          targetSystemCode,
          candidate.trkorr,
          `No valid TPALOG step I found on ${targetSystemCode} during legacy reconciliation.`
        );
        if (changed) result.downgraded += 1;
        result.decisions.push({
          trkorr: candidate.trkorr,
          action: "downgrade",
          message: `No valid TPALOG step I found on ${targetSystemCode}.`
        });
      } catch {
        result.failed += 1;
        result.decisions.push({
          trkorr: candidate.trkorr,
          action: "failed",
          message: `SAP query failed on ${targetSystemCode}; existing lifecycle evidence was preserved.`
        });
      }
    }

    targets.push(result);
  }

  let constraintValidated = false;
  if (!dryRun && await dependencies.countUnresolved() === 0) {
    await dependencies.validateConstraint();
    constraintValidated = true;
  }

  return { dryRun, targets, constraintValidated };
}

function normalizeTargets(values: TransportTargetSystemCode[]) {
  const allowed = new Set<TransportTargetSystemCode>(["QA", "PRD"]);
  return [...new Set(values)].filter((value): value is TransportTargetSystemCode => allowed.has(value));
}
