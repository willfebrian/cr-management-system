import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, PlayCircle, Unlock, XCircle } from "lucide-react";
import {
  fetchReleaseOperation,
  isReleaseOperationTerminal,
  startReleaseOperation,
  testRunRelease,
  type ReleaseCandidateRow,
  type ReleaseOperation,
  type ReleaseResult
} from "../../api/transportReleaseApi";
import { UIModal } from "../common/UIModal";
import { ReleaseOperationStatus, ReleaseResultsPanel } from "./CrTransportRelease";
import { didIssueReleaseSelectionChange, isIssueReleaseReady } from "./issueReleaseModel";

const RELEASE_POLL_MS = 2000;

type IssueCrTransportReleaseProps = {
  candidates: ReleaseCandidateRow[];
  targetLabel: string;
  targetLabels?: Record<string, string>;
  onBusyChange?: (busy: boolean) => void;
  onReleased?: (requests: string[]) => void | Promise<void>;
};

function SectionHeading({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="cr-release-section-heading">
      <div><span className="cr-release-step">{number}</span><h3>{title}</h3><p>{description}</p></div>
    </div>
  );
}

export function IssueCrTransportRelease({ candidates, targetLabel, targetLabels, onBusyChange, onReleased }: IssueCrTransportReleaseProps) {
  const targetSystems = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.targetSystem || "").filter(Boolean))],
    [candidates]
  );
  const [targetSystem, setTargetSystem] = useState(targetSystems[0] || "DEV_AIX");
  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.targetSystem === targetSystem),
    [candidates, targetSystem]
  );
  const [selected, setSelected] = useState<string[]>(() => candidates
    .filter((candidate) => candidate.targetSystem === (targetSystems[0] || "DEV_AIX"))
    .map((candidate) => candidate.trkorr));
  const [testResults, setTestResults] = useState<Record<string, ReleaseResult>>({});
  const [releaseResults, setReleaseResults] = useState<Record<string, ReleaseResult>>({});
  const [operations, setOperations] = useState<Record<string, ReleaseOperation>>({});
  const [busy, setBusy] = useState<"test-run" | "release" | "">("");
  const [activeRequest, setActiveRequest] = useState("");
  const [error, setError] = useState("");
  const [selectionWarning, setSelectionWarning] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batchReleaseSucceeded, setBatchReleaseSucceeded] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => () => { generationRef.current += 1; }, []);
  useEffect(() => onBusyChange?.(Boolean(busy)), [busy, onBusyChange]);

  const releaseReady = isIssueReleaseReady(selected, testResults);
  const hasTestResults = Object.keys(testResults).length > 0;
  const activeOperation = activeRequest ? operations[activeRequest] || null : null;
  const activeReleaseResult = activeRequest ? releaseResults[activeRequest] || null : null;
  const currentTargetLabel = targetLabels?.[targetSystem]
    || (targetSystems[0] === targetSystem ? targetLabel : targetSystem);

  function invalidateTestRun(nextSelection: string[], message = "Selection changed. Run Test Run again before release.") {
    if (!didIssueReleaseSelectionChange(selected, nextSelection)) return;
    generationRef.current += 1;
    setSelected(nextSelection);
    setTestResults({});
    setReleaseResults({});
    setOperations({});
    setActiveRequest("");
    setError("");
    setSelectionWarning(Object.keys(testResults).length ? message : selectionWarning);
    setConfirmOpen(false);
    setBatchReleaseSucceeded(false);
  }

  function toggleRequest(trkorr: string) {
    if (busy || hasTestResults || visibleCandidates.length === 1) return;
    const next = selected.includes(trkorr)
      ? selected.filter((request) => request !== trkorr)
      : [...selected, trkorr];
    invalidateTestRun(next);
  }

  function handleChangeSelection() {
    generationRef.current += 1;
    setTestResults({});
    setReleaseResults({});
    setOperations({});
    setActiveRequest("");
    setError("");
    setSelectionWarning("Selection can now be changed. Run Test Run again before release.");
    setConfirmOpen(false);
    setBatchReleaseSucceeded(false);
  }

  function changeTarget(nextTarget: string) {
    if (busy || nextTarget === targetSystem) return;
    const nextSelection = candidates
      .filter((candidate) => candidate.targetSystem === nextTarget)
      .map((candidate) => candidate.trkorr);
    generationRef.current += 1;
    setTargetSystem(nextTarget);
    setSelected(nextSelection);
    setTestResults({});
    setReleaseResults({});
    setOperations({});
    setActiveRequest("");
    setError("");
    setSelectionWarning(Object.keys(testResults).length ? "Target changed. Run Test Run again before release." : "");
    setConfirmOpen(false);
    setBatchReleaseSucceeded(false);
  }

  async function handleTestRun() {
    if (!selected.length || busy) return;
    const generation = ++generationRef.current;
    setBusy("test-run");
    setError("");
    setSelectionWarning("");
    setTestResults({});
    setReleaseResults({});
    setOperations({});
    setBatchReleaseSucceeded(false);
    try {
      const nextResults: Record<string, ReleaseResult> = {};
      for (const trkorr of selected) {
        setActiveRequest(trkorr);
        const result = await testRunRelease(trkorr, targetSystem);
        if (generation !== generationRef.current) return;
        nextResults[trkorr] = result;
        setTestResults({ ...nextResults });
      }
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation === generationRef.current) {
        setBusy("");
        setActiveRequest("");
      }
    }
  }

  async function handleRelease() {
    if (!releaseReady || busy) return;
    const generation = ++generationRef.current;
    const completed: string[] = [];
    setBusy("release");
    setError("");
    setConfirmOpen(false);
    setReleaseResults({});
    setOperations({});
    try {
      for (const trkorr of selected) {
        setActiveRequest(trkorr);
        let operation = await startReleaseOperation(trkorr, targetSystem);
        setOperations((current) => ({ ...current, [trkorr]: operation }));
        while (!isReleaseOperationTerminal(operation.status)) {
          await waitForPoll();
          if (generation !== generationRef.current) return;
          operation = await fetchReleaseOperation(operation.id);
          setOperations((current) => ({ ...current, [trkorr]: operation }));
        }
        if (operation.result) {
          setReleaseResults((current) => ({ ...current, [trkorr]: operation.result! }));
        }
        if (operation.status !== "succeeded" || !operation.result?.ok) {
          setError(operation.status === "timed_out"
            ? `Release confirmation timed out for ${trkorr}. Check SAP transport status.`
            : operation.message || operation.result?.message || `SAP did not confirm the release of ${trkorr}.`);
          return;
        }
        completed.push(trkorr);
      }
      setBatchReleaseSucceeded(true);
      await onReleased?.(completed);
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation === generationRef.current) {
        setBusy("");
        setActiveRequest("");
      }
    }
  }

  return (
    <div className="cr-release-workspace issue-cr-release-workspace issue-cr-release-content-flow">
      <section className="card cr-release-card">
        <SectionHeading
          number={1}
          title="Select Transport Request"
          description="Choose one or more Created CR transports linked to this Issue."
        />
        <div className="cr-release-table-wrap issue-cr-release-selection-table">
          <table className="cr-release-table">
            <thead><tr>{visibleCandidates.length > 1 ? <th className="center">Select</th> : null}<th>TR Number</th><th>Description</th><th>Lifecycle</th></tr></thead>
            <tbody>
              {visibleCandidates.map((candidate) => {
                const checked = selected.includes(candidate.trkorr);
                return (
                  <tr key={candidate.trkorr} className={checked ? "selected" : ""} onClick={() => toggleRequest(candidate.trkorr)}>
                    {visibleCandidates.length > 1 ? <td className="center"><input type="checkbox" checked={checked} disabled={Boolean(busy) || hasTestResults} readOnly aria-label={`Select ${candidate.trkorr}`} /></td> : null}
                    <td className="monospace">{candidate.trkorr}</td>
                    <td>{candidate.description || "-"}</td>
                    <td><span className="cr-release-badge cr-release-badge-pass">Created</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card cr-release-card issue-cr-release-test-section">
        <SectionHeading
          number={2}
          title="Test Run"
          description="Validate every selected CR, child task, and SAP object before release."
        />
        <div className="cr-release-selected">
          <div className="cr-release-selected-info">
            <strong>{selected.length ? `${selected.length} CR${selected.length === 1 ? "" : "s"} selected` : "No CR selected"}</strong>
            <span>{selected.join(", ") || "Select at least one CR transport."}</span>
          </div>
          <div className="cr-release-buttons">
            {hasTestResults && visibleCandidates.length > 1 && busy !== "test-run" ? (
              <button className="secondary" onClick={handleChangeSelection} disabled={Boolean(busy)}>Change Selection</button>
            ) : (
              <button className="secondary" onClick={handleTestRun} disabled={!selected.length || Boolean(busy)}>
                {busy === "test-run" ? <Loader2 className="spin" size={15} /> : <PlayCircle size={15} />}
                {busy === "test-run" ? `Testing ${activeRequest || "selected CRs"}` : hasTestResults ? "Test Run Again" : "Test Run"}
              </button>
            )}
          </div>
        </div>
        {selectionWarning ? <div className="issue-cr-release-warning"><AlertTriangle size={15} /> {selectionWarning}</div> : null}
        {error && busy !== "release" ? <div className="cr-release-error"><XCircle size={15} /> {error}</div> : null}
        <div className="issue-cr-release-results">
          {selected.map((trkorr) => testResults[trkorr]
            ? <ReleaseResultsPanel key={trkorr} title={`Test Run Result — ${trkorr}`} result={testResults[trkorr]} compact />
            : null)}
        </div>
      </section>

      {releaseReady ? (
        <section className="card cr-release-card" data-issue-release-section="release">
          <SectionHeading
            number={3}
            title="Release"
            description="Release the validated CRs. Child tasks are released first, followed by each parent request."
          />
          <div className="cr-release-selected">
            <div className="cr-release-selected-info">
              <strong>{selected.join(", ")}</strong>
              <span>{selected.length} validated CR{selected.length === 1 ? "" : "s"} ready for release.</span>
            </div>
            <div className="cr-release-buttons">
              <button className="primary" onClick={() => setConfirmOpen(true)} disabled={Boolean(busy) || selected.every((request) => releaseResults[request]?.ok)}>
                {busy === "release" ? <Loader2 className="spin" size={15} /> : <Unlock size={15} />}
                {busy === "release" ? "Release in progress" : selected.length === 1 ? "Release CR" : "Release Selected"}
              </button>
            </div>
          </div>
          <ReleaseOperationStatus
            isReleasing={busy === "release"}
            result={activeReleaseResult || (batchReleaseSucceeded ? { ok: true, message: "All selected CR transports were released." } : null)}
            error={error}
            operation={activeOperation}
          />
          {selected.map((trkorr) => releaseResults[trkorr]
            ? <ReleaseResultsPanel key={trkorr} title={`Release Result — ${trkorr}`} result={releaseResults[trkorr]} compact />
            : null)}
        </section>
      ) : null}

      <UIModal
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="Release selected SAP transport requests?"
        subtitle="Child tasks are released first, followed by each parent. Processing stops at the first failure."
        type="warning"
        confirmText={selected.length === 1 ? "Release CR" : "Release Selected"}
        confirmLoading={busy === "release"}
        confirmDisabled={!releaseReady}
        onConfirm={handleRelease}
      >
        <div className="cr-confirm-summary">
          <div><span>Requests</span><strong>{selected.join(", ")}</strong></div>
          <div><span>Target</span><strong>{currentTargetLabel}</strong></div>
        </div>
      </UIModal>
    </div>
  );
}

function waitForPoll() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, RELEASE_POLL_MS));
}
