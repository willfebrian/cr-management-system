import { useState, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, PlayCircle, RotateCcw, Search, Unlock, XCircle } from "lucide-react";
import { UIModal } from "../common/UIModal";
import {
  fetchReleaseCandidates,
  testRunRelease,
  executeRelease,
  type ReleaseCandidateRow,
  type ReleaseResult,
  type ReleaseTaskResult
} from "../../api/transportReleaseApi";
import { fetchSapSystems, type SapSystemRow } from "../../api";
import { transportSystemOptionLabel } from "./transportTarget";

const TARGET_SYSTEM_STORAGE_KEY = "cr_release_target_system";

export function nextReleaseRefreshToken(current: number, view: string, syncSucceeded: boolean) {
  return view === "cr-transport-release" && syncSucceeded ? current + 1 : current;
}

function statusBadge(status: string) {
  switch (status) {
    case "PASS":
      return { label: "Pass", cls: "cr-release-badge-pass", icon: <Check size={13} /> };
    case "RELEASED":
      return { label: "Released", cls: "cr-release-badge-pass", icon: <CheckCircle2 size={13} /> };
    case "WARNING":
      return { label: "Warning", cls: "cr-release-badge-warn", icon: <AlertTriangle size={13} /> };
    case "ERROR":
      return { label: "Error", cls: "cr-release-badge-error", icon: <XCircle size={13} /> };
    case "SKIPPED":
      return { label: "Skipped", cls: "cr-release-badge-skip", icon: <RotateCcw size={13} /> };
    default:
      return { label: status || "Unknown", cls: "cr-release-badge-skip", icon: null };
  }
}

interface CrTransportReleaseProps {
  targetSystem?: string;
  onTargetSystemChange?: (val: string) => void;
  availableSystems?: SapSystemRow[];
  refreshToken?: number;
}

export function CrTransportRelease({
  targetSystem: externalTargetSystem,
  onTargetSystemChange,
  availableSystems: externalAvailableSystems,
  refreshToken = 0
}: CrTransportReleaseProps) {
  const [internalTargetSystem, setInternalTargetSystem] = useState<string>(() => {
    try { return localStorage.getItem(TARGET_SYSTEM_STORAGE_KEY) || "DEV_AIX"; } catch { return "DEV_AIX"; }
  });
  const targetSystem = externalTargetSystem ?? internalTargetSystem;

  const [fetchedSystems, setFetchedSystems] = useState<SapSystemRow[]>([]);
  const availableSystems = externalAvailableSystems ?? fetchedSystems;

  const systemOptions = useMemo(() => {
    if (availableSystems && availableSystems.length > 0) {
      return availableSystems.map((sys) => ({
        code: sys.code,
        label: transportSystemOptionLabel(sys.code, sys.description)
      }));
    }
    return [
      { code: "DEV_AIX", label: transportSystemOptionLabel("DEV_AIX", "Development AIX") },
      { code: "DEV_NC", label: transportSystemOptionLabel("DEV_NC", "Sandbox New Company") }
    ];
  }, [availableSystems]);

  const [candidates, setCandidates] = useState<ReleaseCandidateRow[]>([]);
  const [selectedTrkorr, setSelectedTrkorr] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState("");
  const [busy, setBusy] = useState<"candidates" | "test-run" | "release" | "">("");
  const [error, setError] = useState("");
  const [testRunResult, setTestRunResult] = useState<ReleaseResult | null>(null);
  const [releaseResult, setReleaseResult] = useState<ReleaseResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const candidateRequestRef = useRef(0);

  useEffect(() => {
    if (externalAvailableSystems) return;
    fetchSapSystems()
      .then((res) => {
        if (res.rows && res.rows.length > 0) {
          const active = res.rows.filter((s: SapSystemRow) => s.is_active);
          setFetchedSystems(active.length > 0 ? active : res.rows);
        }
      })
      .catch(() => {});
  }, [externalAvailableSystems]);

  useEffect(() => {
    const delay = searchFilter.trim() ? 300 : 0;
    const timeout = window.setTimeout(() => {
      void loadCandidates(searchFilter);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [targetSystem, refreshToken, searchFilter]);

  async function loadCandidates(query = searchFilter) {
    const requestId = ++candidateRequestRef.current;
    setBusy("candidates");
    setError("");
    setCandidates([]);
    setSelectedTrkorr("");
    setTestRunResult(null);
    setReleaseResult(null);
    try {
      const result = await fetchReleaseCandidates(targetSystem, 50, query);
      if (requestId !== candidateRequestRef.current) return;
      setCandidates(result.rows);
    } catch (e) {
      if (requestId !== candidateRequestRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (requestId === candidateRequestRef.current) setBusy("");
    }
  }

  async function handleTestRun() {
    if (!selectedTrkorr) return;
    setBusy("test-run");
    setError("");
    setTestRunResult(null);
    setReleaseResult(null);
    try {
      const result = await testRunRelease(selectedTrkorr, targetSystem);
      setTestRunResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function handleRelease() {
    if (!selectedTrkorr) return;
    setBusy("release");
    setError("");
    try {
      const result = await executeRelease(selectedTrkorr, targetSystem);
      setReleaseResult(result);
      if (result.ok) {
        setConfirmOpen(false);
        void loadCandidates(searchFilter);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  function handleTargetSystemChange(val: string) {
    if (onTargetSystemChange) {
      onTargetSystemChange(val);
    } else {
      setInternalTargetSystem(val);
      try { localStorage.setItem(TARGET_SYSTEM_STORAGE_KEY, val); } catch {}
    }
  }

  const selectedCandidate = candidates.find((c) => c.trkorr === selectedTrkorr);
  const selectedTargetLabel = systemOptions.find((option) => option.code === targetSystem)?.label
    || transportSystemOptionLabel(targetSystem);
  const canTestRun = !!selectedTrkorr && !busy && !releaseResult?.ok;
  const canRelease = !!testRunResult?.ok && !testRunResult.hasErrors && !busy && !releaseResult?.ok;

  return (
    <div className="cr-release-workspace">
      {/* Step 1: Select CR */}
      <section className="card cr-release-card">
        <div className="cr-release-section-heading">
          <div><span className="cr-release-step">1</span><h3>Select Transport Request</h3><p>Select an outstanding parent request from the synchronized SAP data.</p></div>
        </div>

        <div className="cr-release-search">
          <Search size={17} />
          <input
            type="text"
            placeholder="Filter by TR number, description, or owner..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            disabled={!!busy}
          />
        </div>

        {busy === "candidates" ? (
          <div className="cr-release-empty"><Loader2 className="spin" size={18} /> Loading candidates...</div>
        ) : candidates.length === 0 ? (
          <div className="cr-release-empty">{searchFilter.trim()
            ? "No transport requests match the current filter."
            : "No outstanding parent transport requests found for this target. Make sure the data has been synchronized from SAP."}</div>
        ) : (
          <div className="cr-release-table-wrap">
            <table className="cr-release-table">
              <thead>
                <tr>
                  <th>TR Number</th>
                  <th>Description</th>
                  <th>Owner</th>
                  <th className="center">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((row) => (
                  <tr
                    key={row.trkorr}
                    className={selectedTrkorr === row.trkorr ? "selected" : ""}
                    onClick={() => { setSelectedTrkorr(row.trkorr); setTestRunResult(null); setReleaseResult(null); setError(""); }}
                  >
                    <td className="monospace">{row.trkorr}</td>
                    <td>{row.description || "-"}</td>
                    <td>{row.owner || "-"}</td>
                    <td className="center">{row.taskCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Step 2: Test Run & Release */}
      <section className="card cr-release-card">
        <div className="cr-release-section-heading">
          <div><span className="cr-release-step">2</span><h3>Test Run & Release</h3><p>Run a pre-check, then confirm release. Children are released first, then the parent.</p></div>
        </div>

        {selectedCandidate ? (
          <div className="cr-release-selected">
            <div className="cr-release-selected-info">
              <strong>{selectedCandidate.trkorr}</strong>
              <span>{selectedCandidate.description}</span>
              <small>Owner: {selectedCandidate.owner} &middot; Tasks: {selectedCandidate.taskCount}</small>
            </div>
            <div className="cr-release-buttons">
              <button className="secondary" onClick={handleTestRun} disabled={!canTestRun}>
                {busy === "test-run" ? <Loader2 className="spin" size={15} /> : <PlayCircle size={15} />} Test Run
              </button>
              <button className="primary" onClick={() => setConfirmOpen(true)} disabled={!canRelease}>
                {busy === "release" ? <Loader2 className="spin" size={15} /> : <Unlock size={15} />} Release
              </button>
            </div>
          </div>
        ) : (
          <div className="cr-release-empty">Select a parent transport request to view its child tasks and run the pre-check before release.</div>
        )}

        {error && (
          <div className="cr-release-error"><XCircle size={15} /> {error}</div>
        )}

        {testRunResult && !releaseResult && <ResultsPanel title="Test Run Result" result={testRunResult} />}
        {releaseResult && <ResultsPanel title="Release Result" result={releaseResult} />}
      </section>

      <ReleaseConfirmationDialog
        isOpen={confirmOpen}
        busy={busy === "release"}
        candidate={selectedCandidate}
        targetLabel={selectedTargetLabel}
        error={confirmOpen ? error : ""}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRelease}
      />
    </div>
  );
}

type ReleaseConfirmationDialogProps = {
  isOpen: boolean;
  busy: boolean;
  candidate?: ReleaseCandidateRow;
  targetLabel: string;
  error?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ReleaseConfirmationDialog({
  isOpen,
  busy,
  candidate,
  targetLabel,
  error = "",
  onClose,
  onConfirm
}: ReleaseConfirmationDialogProps) {
  return (
    <UIModal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Release SAP transport request?"
      subtitle="Child tasks are released first, followed by the parent. This action cannot be undone."
      type="warning"
      confirmText="Release Request"
      confirmLoading={busy}
      confirmDisabled={!candidate}
      onConfirm={onConfirm}
    >
      <div className="cr-confirm-summary">
        <div><span>Request</span><strong>{candidate?.trkorr || "-"}</strong></div>
        <div><span>Child Tasks</span><strong>{candidate?.taskCount ?? 0} child task{candidate?.taskCount === 1 ? "" : "s"}</strong></div>
        <div><span>Target</span><strong>{targetLabel}</strong></div>
      </div>
      {error ? <div className="cr-confirm-error"><AlertTriangle size={16} /> {error}</div> : null}
    </UIModal>
  );
}

function ResultsPanel({ title, result }: { title: string; result: ReleaseResult }) {
  const cls = result.ok ? "cr-release-result-ok" : "cr-release-result-error";
  const Icon = result.ok ? CheckCircle2 : XCircle;

  return (
    <div className={`cr-release-result ${cls}`}>
      <div className="cr-release-result-header">
        <Icon size={16} /> <span>{title}</span> <small>{result.message}</small>
      </div>
      <table className="cr-release-table">
        <thead>
          <tr>
            <th className="center">#</th>
            <th>TR Number</th>
            <th>Description</th>
            <th className="center">Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {result.tasks.map((task, i) => {
            const badge = statusBadge(task.status);
            return (
              <tr key={`${task.trkorr}-${i}`}>
                <td className="center muted">{task.sequence}</td>
                <td className="monospace">{task.trkorr}</td>
                <td>{task.description || "-"}</td>
                <td className="center"><span className={`cr-release-badge ${badge.cls}`}>{badge.icon} {badge.label}</span></td>
                <td className="muted">{task.message}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
