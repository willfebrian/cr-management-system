import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Database, FileSearch, RefreshCw, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cancelIssue as cancelIssueRequest, deleteIssue as deleteIssueRequest, fetchCrDetail, fetchCrList, fetchDashboard, fetchIssueDetail, fetchIssueList, fetchNextIssueNumber, fetchNextSubIssueNumber, fetchStatusTrend, fetchSystems, fetchValueHelp, saveIssue, syncCr, type CrFilters, type IssueFilters, type IssueSavePayload, type SyncCrOptions, type SyncCrResult, type ValueHelpKind } from "../api";
import type { CrDetail, CrRequest, DashboardData, IssueDetail, IssueRow, SapSystemConfig, StatusTrendData } from "../../shared/types";

type View = "dashboard" | "report" | "issue-display" | "issue-create" | "issue-change";
const SYNC_RESULT_VISIBLE_MS = 6000;
const DASHBOARD_DB_REFRESH_MS = 60000;
const REPORT_DB_REFRESH_MS = 120000;

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [systems, setSystems] = useState<SapSystemConfig[]>([]);
  const [trend, setTrend] = useState<StatusTrendData | null>(null);
  const [trendFilters, setTrendFilters] = useState({
    fromPeriod: `${new Date().getFullYear()}-01`,
    toPeriod: currentMonthValue()
  });
  const [requests, setRequests] = useState<CrRequest[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState<CrFilters>({ sapSystemCode: "DEV", status: "all", page: 1, pageSize: 25 });
  const [draftFilters, setDraftFilters] = useState<CrFilters>({ sapSystemCode: "DEV", status: "all", page: 1, pageSize: 25 });
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [issuePagination, setIssuePagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [issueFilters, setIssueFilters] = useState<IssueFilters>({ status: "all", page: 1, pageSize: 25 });
  const [draftIssueFilters, setDraftIssueFilters] = useState<IssueFilters>({ status: "all", page: 1, pageSize: 25 });
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [issueDetail, setIssueDetail] = useState<IssueDetail | null>(null);
  const [syncSystems, setSyncSystems] = useState<string[]>(["DEV", "QA", "PRD"]);
  const [syncMode, setSyncMode] = useState<"incremental" | "full_period">("incremental");
  const [lookbackDays, setLookbackDays] = useState(3);
  const [syncFromPeriod, setSyncFromPeriod] = useState(`${new Date().getFullYear()}-01`);
  const [syncToPeriod, setSyncToPeriod] = useState(currentMonthValue());
  const [syncOptions, setSyncOptions] = useState<SyncCrOptions>({
    systemCode: "DEV",
    fromDate: `${new Date().getFullYear()}-01-01`,
    toDate: todayYmd()
  });
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<CrDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncCrResult | null>(null);
  const [runningSyncSystems, setRunningSyncSystems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [issueFormDirty, setIssueFormDirty] = useState(false);
  const reportRequestId = useRef(0);
  const issueRequestId = useRef(0);

  async function loadDashboardData() {
    const [dashboardData, trendData, systemData] = await Promise.all([
      fetchDashboard(),
      fetchStatusTrend(trendFilters),
      fetchSystems()
    ]);
    setDashboard(dashboardData);
    setTrend(trendData);
    setSystems(systemData.rows);
  }

  async function loadReport(nextFilters = filters) {
    const requestId = ++reportRequestId.current;
    const crData = await fetchCrList(nextFilters);
    if (requestId !== reportRequestId.current) return;
    setRequests(crData.rows);
    setPagination({ page: crData.page, pageSize: crData.pageSize, total: crData.total, totalPages: crData.totalPages });
    if (!crData.rows.some((request) => requestKey(request) === selected)) setSelected("");
  }

  async function loadIssues(nextFilters = issueFilters) {
    const requestId = ++issueRequestId.current;
    const issueData = await fetchIssueList(nextFilters);
    if (requestId !== issueRequestId.current) return;
    setIssues(issueData.rows);
    setIssuePagination({ page: issueData.page, pageSize: issueData.pageSize, total: issueData.total, totalPages: issueData.totalPages });
    if (!issueData.rows.some((issue) => issue.id === selectedIssueId)) setSelectedIssueId(null);
  }

  async function load(nextFilters = filters) {
    setError("");
    try {
      await Promise.all([loadDashboardData(), loadReport(nextFilters)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runSync() {
    const period = resolveMonthPeriod(syncFromPeriod, syncToPeriod);
    const options = { ...syncOptions, systemCodes: syncSystems, syncMode, lookbackDays, ...period };
    const periodText = syncMode === "incremental"
      ? `incremental with ${lookbackDays} day lookback`
      : `from ${options.fromDate} to ${options.toDate}`;
    const confirmed = window.confirm(
      `Sync CR ${syncSystems.join(", ")} ${periodText}?\n\nThis is read-only from SAP and will update PostgreSQL cache.`
    );
    if (!confirmed) return;
    setLoading(true);
    setSyncResult(null);
    setRunningSyncSystems(syncSystems);
    setError("");
    showToast("success", "Sync started...");
    try {
      const result = await syncCr(options);
      setSyncResult(result);
      if (!result.ok) {
        showToast("error", result.message || "Sync CR failed for all selected systems.");
        return;
      }
      const confirmedTargets = result.lifecycleResults?.filter((item) => item.evidenceSource === "confirmed").length || 0;
      const orphanText = result.orphanImportsFound
        ? `, orphan recovered ${result.orphanImportsRecovered || 0}/${result.orphanImportsFound}`
        : "";
      showToast("success", `Sync completed: ${result.requestCount} request(s), lifecycle checked for ${confirmedTargets} target(s)${orphanText}.`);
      const resetFilters = { ...filters, page: 1 };
      setFilters(resetFilters);
      setDraftFilters(resetFilters);
      await load(resetFilters);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRunningSyncSystems([]);
    }
  }

  function openReportFromTrend(status: string, monthStart: string) {
    if (!navigateTo("report")) return;
    const fromDate = monthStart;
    const toDate = endOfMonth(monthStart);
    const nextFilters = { ...filters, sapSystemCode: "DEV", status, fromDate, toDate, page: 1, pageSize: pagination.pageSize };
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    loadReport(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  function openReportFromCrLink(link: { sap_system_code?: string; trkorr: string }) {
    if (!navigateTo("report")) return;
    const sapSystemCode = link.sap_system_code || "DEV";
    const nextFilters = {
      ...filters,
      sapSystemCode,
      status: "all",
      lifecycleStatus: "all",
      q: link.trkorr,
      page: 1,
      pageSize: pagination.pageSize
    };
    setSelected(`${sapSystemCode}:${link.trkorr}`);
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    loadReport(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  function navigateTo(nextView: View) {
    if (nextView === view) return true;
    if ((view === "issue-create" || view === "issue-change") && issueFormDirty) {
      const confirmed = window.confirm("Perubahan Issue yang belum disimpan akan hilang. Lanjut pindah menu?");
      if (!confirmed) return false;
    }
    setIssueFormDirty(false);
    setView(nextView);
    return true;
  }

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4500);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (view !== "dashboard") return;
    const interval = window.setInterval(() => {
      loadDashboardData().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, DASHBOARD_DB_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [view, trendFilters.fromPeriod, trendFilters.toPeriod]);

  useEffect(() => {
    if (view !== "report") return;
    const interval = window.setInterval(() => {
      loadReport(filters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
      if (selected) {
        const key = parseRequestKey(selected);
        fetchCrDetail(key.trkorr, key.sapSystemCode).then(setDetail).catch((err) => setError(err.message));
      }
    }, REPORT_DB_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [view, filters, selected]);

  useEffect(() => {
    if (view !== "issue-display") return;
    const interval = window.setInterval(() => {
      loadIssues(issueFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
      if (selectedIssueId) {
        fetchIssueDetail(selectedIssueId).then(setIssueDetail).catch((err) => setError(err.message));
      }
    }, REPORT_DB_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [view, issueFilters, selectedIssueId]);

  useEffect(() => {
    const enabledCodes = systems.filter((system) => system.enabled).map((system) => system.code);
    if (enabledCodes.length && syncSystems.length === 0) setSyncSystems(enabledCodes);
  }, [systems, syncSystems.length]);

  useEffect(() => {
    if (!syncResult || loading) return;
    const timeout = window.setTimeout(() => setSyncResult(null), SYNC_RESULT_VISIBLE_MS);
    return () => window.clearTimeout(timeout);
  }, [syncResult, loading]);

  useEffect(() => {
    if (view !== "report") return;
    const queryChanged = (draftFilters.q?.trim() || "") !== (filters.q?.trim() || "");
    const nextFilters = {
      ...filters,
      status: draftFilters.status || "all",
      lifecycleStatus: draftFilters.lifecycleStatus || "all",
      q: draftFilters.q?.trim() || undefined,
      fromDate: draftFilters.fromDate || undefined,
      toDate: draftFilters.toDate || undefined,
      page: 1,
      pageSize: pagination.pageSize
    };
    if (reportFilterKey(nextFilters) === reportFilterKey(filters)) return;

    const timeout = window.setTimeout(() => {
      setFilters(nextFilters);
      setDraftFilters((current) => ({ ...current, page: 1, pageSize: pagination.pageSize }));
      loadReport(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, queryChanged ? 450 : 80);

    return () => window.clearTimeout(timeout);
  }, [draftFilters.status, draftFilters.lifecycleStatus, draftFilters.q, draftFilters.fromDate, draftFilters.toDate, view, pagination.pageSize]);

  useEffect(() => {
    if (view !== "issue-display") return;
    const queryChanged = (draftIssueFilters.q?.trim() || "") !== (issueFilters.q?.trim() || "");
    const nextFilters = {
      ...issueFilters,
      status: draftIssueFilters.status || "all",
      q: draftIssueFilters.q?.trim() || undefined,
      requester: draftIssueFilters.requester?.trim() || undefined,
      abaper: draftIssueFilters.abaper?.trim() || undefined,
      cr: draftIssueFilters.cr?.trim() || undefined,
      glpi: draftIssueFilters.glpi?.trim() || undefined,
      crHelpdesk: draftIssueFilters.crHelpdesk?.trim() || undefined,
      fromDate: draftIssueFilters.fromDate || undefined,
      toDate: draftIssueFilters.toDate || undefined,
      page: 1,
      pageSize: issuePagination.pageSize
    };
    if (issueFilterKey(nextFilters) === issueFilterKey(issueFilters)) return;

    const timeout = window.setTimeout(() => {
      setIssueFilters(nextFilters);
      setDraftIssueFilters((current) => ({ ...current, page: 1, pageSize: issuePagination.pageSize }));
      loadIssues(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, queryChanged ? 450 : 80);

    return () => window.clearTimeout(timeout);
  }, [draftIssueFilters.status, draftIssueFilters.q, draftIssueFilters.requester, draftIssueFilters.abaper, draftIssueFilters.cr, draftIssueFilters.glpi, draftIssueFilters.crHelpdesk, draftIssueFilters.fromDate, draftIssueFilters.toDate, view, issuePagination.pageSize]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const key = parseRequestKey(selected);
    fetchCrDetail(key.trkorr, key.sapSystemCode).then(setDetail).catch((err) => setError(err.message));
  }, [selected]);

  useEffect(() => {
    if (!selectedIssueId) {
      setIssueDetail(null);
      return;
    }
    fetchIssueDetail(selectedIssueId).then(setIssueDetail).catch((err) => setError(err.message));
  }, [selectedIssueId]);

  const selectedRequest = useMemo(() => requests.find((request) => requestKey(request) === selected), [requests, selected]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={22} />
          <span>CR Management System</span>
        </div>
        <button className={view === "dashboard" ? "active" : ""} onClick={() => navigateTo("dashboard")}>
          <BarChart3 size={18} /> Dashboard
        </button>
        <button className={view === "report" ? "active" : ""} onClick={() => navigateTo("report")}>
          <FileSearch size={18} /> Report
        </button>
        <div className={`sidebar-group ${view.startsWith("issue-") ? "active" : ""}`}>
          <button className={view.startsWith("issue-") ? "active" : ""} onClick={() => {
            if (!navigateTo("issue-display")) return;
            loadIssues(issueFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
          }}>
            <ClipboardList size={18} /> Issue
          </button>
          {view.startsWith("issue-") ? (
            <div className="sidebar-submenu">
              <button className={view === "issue-display" ? "active" : ""} onClick={() => {
                if (!navigateTo("issue-display")) return;
                loadIssues(issueFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
              }}>
                Display
              </button>
              <button className={view === "issue-create" ? "active" : ""} onClick={() => navigateTo("issue-create")}>Create</button>
              <button className={view === "issue-change" ? "active" : ""} onClick={() => navigateTo("issue-change")}>Change</button>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar report-topbar">
          <div>
            <h1>{view === "dashboard" ? "Dashboard" : view === "report" ? "CR Report" : view === "issue-create" ? "Create Issue" : view === "issue-change" ? "Change Issue" : "Issue"}</h1>
            {view === "dashboard" ? (
              <div className="header-sync">
                <CheckCircle2 size={15} />
                <span>
                  Last successful sync:{" "}
                  {dashboard?.lastSuccessfulSync ? formatDateTime(dashboard.lastSuccessfulSync.finished_at || dashboard.lastSuccessfulSync.started_at) : "No successful sync"}
                </span>
              </div>
            ) : null}
          </div>
          <div className={`sync-controls report-sync-controls ${syncMode === "full_period" ? "full-mode" : "incremental-mode"}`}>
            <label>
              Source Systems
              <div className="system-checks">
                {systems.map((system) => (
                  <label key={system.code} className={!system.enabled ? "disabled" : ""} title={!system.enabled ? "Disabled in .env" : systemLabel(system)}>
                    <input
                      type="checkbox"
                      checked={syncSystems.includes(system.code)}
                      disabled={!system.enabled}
                      onChange={() => setSyncSystems(toggleSystem(syncSystems, system.code))}
                    />
                    {system.code}
                  </label>
                ))}
              </div>
            </label>
            <label>
              Sync Mode
              <select value={syncMode} onChange={(event) => setSyncMode(event.target.value as "incremental" | "full_period")}>
                <option value="incremental">Incremental</option>
                <option value="full_period">Full by Period</option>
              </select>
            </label>
            {syncMode === "incremental" ? (
              <label>
                Lookback Days
                <input type="number" min="0" max="30" value={lookbackDays} onChange={(event) => setLookbackDays(Number(event.target.value || 0))} />
              </label>
            ) : (
              <>
            <label>
              From Period
              <input type="month" value={syncFromPeriod} onChange={(event) => setSyncFromPeriod(event.target.value)} />
            </label>
            <label>
              To Period
              <input type="month" value={syncToPeriod} onChange={(event) => setSyncToPeriod(event.target.value)} />
            </label>
              </>
            )}
            <button className="primary sync-button" onClick={runSync} disabled={loading || syncSystems.length === 0}>
              <RefreshCw size={18} /> <span>{loading ? "Syncing" : "Sync CR"}</span>
            </button>
          </div>
        </header>

        {error ? <div className="notice">{error}</div> : null}
        {toast ? (
          <div className={`toast ${toast.type}`} role="status">
            {toast.type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{toast.message}</span>
          </div>
        ) : null}
        {loading || syncResult ? (
          <SyncRunSummary loading={loading} systems={runningSyncSystems} result={syncResult} />
        ) : null}

        {view === "dashboard" ? (
          <Dashboard
            dashboard={dashboard}
            requests={requests}
            trend={trend}
            trendFilters={trendFilters}
            onTrendFilters={setTrendFilters}
            onApplyTrend={() => load()}
            onTrendClick={openReportFromTrend}
          />
        ) : view === "report" ? (
          <Report
            requests={requests}
            filters={draftFilters}
            pagination={pagination}
            onFilters={setDraftFilters}
            onPage={(page) => {
              const nextFilters = { ...filters, page };
              setFilters(nextFilters);
              loadReport(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}
            onPageSize={(pageSize) => {
              const nextFilters = { ...filters, page: 1, pageSize };
              setFilters(nextFilters);
              setDraftFilters({ ...draftFilters, page: 1, pageSize });
              loadReport(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}
            selected={selected}
            onSelect={setSelected}
            onCloseDetail={() => setSelected("")}
            selectedRequest={selectedRequest}
            detail={detail}
          />
        ) : view === "issue-display" ? (
          <IssueDisplay
            issues={issues}
            filters={draftIssueFilters}
            pagination={issuePagination}
            selectedId={selectedIssueId}
            detail={issueDetail}
            onFilters={setDraftIssueFilters}
            onSelect={setSelectedIssueId}
            onCloseDetail={() => setSelectedIssueId(null)}
            onPage={(page) => {
              const nextFilters = { ...issueFilters, page };
              setIssueFilters(nextFilters);
              loadIssues(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}
            onPageSize={(pageSize) => {
              const nextFilters = { ...issueFilters, page: 1, pageSize };
              setIssueFilters(nextFilters);
              setDraftIssueFilters({ ...draftIssueFilters, page: 1, pageSize });
              loadIssues(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}
            onOpenCr={openReportFromCrLink}
          />
        ) : view === "issue-create" ? (
          <IssueEditor
            mode="create"
            detail={null}
            onDirtyChange={setIssueFormDirty}
            onSave={async (payload) => {
              setError("");
              try {
                const saved = await saveIssue(payload);
                setIssueDetail(saved);
                setSelectedIssueId(saved.issue?.id || null);
                setIssueFormDirty(false);
                showToast("success", "Issue saved.");
                setView("issue-display");
                await loadIssues({ ...issueFilters, page: 1 });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        ) : (
          <ChangeIssue
            onNotify={showToast}
            onDirtyChange={setIssueFormDirty}
            onSave={async (payload) => {
              setError("");
              try {
                const saved = await saveIssue(payload);
                setIssueDetail(saved);
                setSelectedIssueId(saved.issue?.id || null);
                setIssueFormDirty(false);
                showToast("success", "Issue saved.");
                setView("issue-display");
                await loadIssues({ ...issueFilters, page: 1 });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
            onCancel={async (id, reason) => {
              setError("");
              try {
                await cancelIssueRequest(id, reason);
                setIssueDetail(null);
                setSelectedIssueId(null);
                setIssueFormDirty(false);
                showToast("success", "Issue cancelled.");
                setView("issue-display");
                await loadIssues({ ...issueFilters, page: 1 });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
            onDelete={async (id) => {
              setError("");
              try {
                await deleteIssueRequest(id);
                setIssueDetail(null);
                setSelectedIssueId(null);
                setIssueFormDirty(false);
                showToast("success", "Issue deleted.");
                setView("issue-display");
                await loadIssues({ ...issueFilters, page: 1 });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        )}
      </section>
    </main>
  );
}

function SyncRunSummary({
  loading,
  systems,
  result
}: {
  loading: boolean;
  systems: string[];
  result: SyncCrResult | null;
}) {
  if (loading) {
    return (
      <section className="sync-summary">
        <div>
          <strong>Sync CR running</strong>
          <span>Waiting for SAP response and updating PostgreSQL cache.</span>
        </div>
        <div className="sync-summary-list">
          {systems.map((system) => (
            <span className="sync-summary-chip" key={system}>
              {system}<Status value="running" />
            </span>
          ))}
        </div>
      </section>
    );
  }

  if (!result) return null;
  return (
    <section className="sync-summary">
      <div>
        <strong>Last manual sync result</strong>
        <span>{result.requestCount} CR updated from selected SAP system(s).</span>
      </div>
      <div className="sync-summary-list">
        {result.results.map((item) => (
          <span className="sync-summary-chip" key={`${item.systemCode}-${item.syncRunId}`}>
            {item.systemCode}
            <Status value={item.status} />
            <small>{item.requestCount} CR</small>
            <small>{periodLabel(item.period)}</small>
          </span>
        ))}
        {(result.lifecycleResults || []).map((item) => (
          <span className="sync-summary-chip" key={`lifecycle-${item.targetSystemCode}`}>
            {item.targetSystemCode} lifecycle
            <Status value={item.evidenceSource === "confirmed" ? "success" : "unknown"} />
            <small>{item.evidenceSource === "confirmed" ? `${item.logCount || 0} log` : "Fallback inferred"}</small>
            {item.orphanImportsFound ? <small>{item.orphanImportsRecovered || 0}/{item.orphanImportsFound} orphan recovered</small> : null}
            <small>{periodLabel(item.period)}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

function Dashboard({
  dashboard,
  requests,
  trend,
  trendFilters,
  onTrendFilters,
  onApplyTrend,
  onTrendClick
}: {
  dashboard: DashboardData | null;
  requests: CrRequest[];
  trend: StatusTrendData | null;
  trendFilters: { fromPeriod: string; toPeriod: string };
  onTrendFilters: (filters: { fromPeriod: string; toPeriod: string }) => void;
  onApplyTrend: () => void;
  onTrendClick: (status: string, monthStart: string) => void;
}) {
  const outstanding = dashboard?.byStatus.find((row) => row.status_group === "outstanding")?.count || 0;
  const released = dashboard?.byStatus.find((row) => row.status_group === "released")?.count || 0;
  return (
    <div className="dashboard-grid">
      <Metric label="Outstanding" value={outstanding} />
      <Metric label="Released" value={released} />
      <Metric label="Aging > 14 Days" value={dashboard?.aging?.older_than_14_days || 0} />
      <Metric label="Pending to QA" value={dashboard?.landscape?.pending_qa || 0} />
      <Metric label="Pending to PRD" value={dashboard?.landscape?.pending_prd || 0} />
      <section className="panel lifecycle-panel">
        <h2>Lifecycle Funnel</h2>
        <div className="funnel-list">
          {(dashboard?.lifecycleFunnel || []).map((item, index, items) => (
            <div className="funnel-item" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <div>
                <i style={{ width: `${funnelWidth(item.value, items[0]?.value || 0)}%` }} />
              </div>
              <small>{index < items.length - 1 ? dropOffText(item.value, items[index + 1]?.value || 0) : "Final landscape"}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>CR Status Trend</h2>
            <p>{periodRangeLabel(trendFilters)} - Parent CR only</p>
          </div>
          <div className="chart-filters">
            <label>
              From Period
              <input type="month" value={trendFilters.fromPeriod} onChange={(event) => onTrendFilters({ ...trendFilters, fromPeriod: event.target.value })} />
            </label>
            <label>
              To Period
              <input type="month" value={trendFilters.toPeriod} onChange={(event) => onTrendFilters({ ...trendFilters, toPeriod: event.target.value })} />
            </label>
            <button className="secondary" onClick={onApplyTrend}>Apply</button>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend?.rows || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month_label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="outstanding" fill="#e0a11b" name="Outstanding" radius={[4, 4, 0, 0]} onClick={(data) => onTrendClick("outstanding", data.payload.month_start)} />
              <Bar dataKey="released" fill="#0f766e" name="Released" radius={[4, 4, 0, 0]} onClick={(data) => onTrendClick("released", data.payload.month_start)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel wide">
        <h2>Sync Health</h2>
        <div className="sync-health-grid">
          {(dashboard?.syncHealth || []).map((item) => (
            <div className="sync-health-card" key={item.sap_system_code}>
              <span>{item.sap_system_code}</span>
              <Status value={item.status} />
              <small>{formatDateTime(item.finished_at || item.started_at)}</small>
              <small>{syncModeLabel(item.sync_mode, item.lookback_days)}</small>
              <small>{periodLabel({ fromDate: item.from_date || "", toDate: item.to_date || "", periodType: item.sync_mode || "" })}</small>
              <strong>{item.request_count} CR</strong>
            </div>
          ))}
          {dashboard && dashboard.syncHealth.length === 0 ? <div className="empty">No sync run cached.</div> : null}
        </div>
      </section>
      <section className="panel wide">
        <h2>Recent Activity</h2>
        <div className="rows">
          {(dashboard?.recentActivity || requests.slice(0, 8)).map((request) => (
            <div className="row" key={`${request.sap_system_code}-${request.trkorr}`}>
              <span>{request.sap_system_code} - {request.trkorr}</span>
              <small>{request.description}</small>
              <Status value={request.status_group} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function useResizableColumns<T extends string>(storageKey: string, defaults: Record<T, number>, minimums: Record<T, number>) {
  const [widths, setWidths] = useState<Record<T, number>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });

  function persist(nextWidths: Record<T, number>) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(nextWidths));
  }

  function startResize(column: T, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[column];

    function onMove(moveEvent: MouseEvent) {
      const nextWidth = Math.max(minimums[column], startWidth + moveEvent.clientX - startX);
      setWidths((current) => {
        const next = { ...current, [column]: nextWidth };
        persist(next);
        return next;
      });
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return {
    widths,
    totalWidth: (Object.values(widths) as number[]).reduce((total, width) => total + Number(width || 0), 0),
    startResize
  };
}

function ResizableHeader<T extends string>({
  label,
  column,
  width,
  onResize
}: {
  label: string;
  column: T;
  width: number;
  onResize: (column: T, event: ReactMouseEvent) => void;
}) {
  return (
    <th className="resizable-header" style={{ width }}>
      <span>{label}</span>
      <button
        className="column-resize-handle"
        type="button"
        aria-label={`Resize ${label || "column"}`}
        onMouseDown={(event) => onResize(column, event)}
      />
    </th>
  );
}

function Report({
  requests,
  filters,
  pagination,
  onFilters,
  onPage,
  onPageSize,
  selected,
  onSelect,
  onCloseDetail,
  selectedRequest,
  detail
}: {
  requests: CrRequest[];
  filters: CrFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  onFilters: (filters: CrFilters) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  selected: string;
  onSelect: (value: string) => void;
  onCloseDetail: () => void;
  selectedRequest?: CrRequest;
  detail: CrDetail | null;
}) {
  const displayRequest = selectedRequest || detail?.request;
  const hasDetail = Boolean(selected && displayRequest);
  const crColumns = useResizableColumns("cr-report-columns", {
    cr: 144,
    description: 520,
    lifecycle: 140
  }, {
    cr: 110,
    description: 220,
    lifecycle: 120
  });

  function updateFilter(key: keyof CrFilters, value: string) {
    onFilters({ ...filters, [key]: value });
  }

  function updateStatusFilter(value: string) {
    const status = ["all", "outstanding", "released"].includes(value) ? value : "all";
    const lifecycleStatus = value.startsWith("pending_") || value.startsWith("in_") ? value : "all";
    onFilters({ ...filters, status, lifecycleStatus });
  }

  return (
    <>
      <section className="filterbar report-filterbar">
        <select className="status-filter" value={filters.lifecycleStatus && filters.lifecycleStatus !== "all" ? filters.lifecycleStatus : filters.status || "all"} onChange={(event) => updateStatusFilter(event.target.value)}>
          <option value="all">All</option>
          <option value="outstanding">Outstanding</option>
          <option value="released">Released</option>
          <option value="pending_qa">Pending to QA</option>
          <option value="in_qa">In QA</option>
          <option value="pending_prd">Pending to PRD</option>
          <option value="in_prd">In PRD</option>
        </select>
        <input value={filters.q || ""} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search CR, description, object" />
        <input type="date" value={filters.fromDate || ""} onChange={(event) => updateFilter("fromDate", event.target.value)} />
        <input type="date" value={filters.toDate || ""} onChange={(event) => updateFilter("toDate", event.target.value)} />
      </section>

      <div className={`report-layout ${hasDetail ? "" : "detail-closed"}`}>
        <section className="table-panel report-table-panel cr-table-panel">
          <div className="table-scroll">
            <table className="record-table cr-record-table" style={{ width: crColumns.totalWidth, minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: crColumns.widths.cr }} />
                <col style={{ width: crColumns.widths.description }} />
                <col style={{ width: crColumns.widths.lifecycle }} />
              </colgroup>
              <thead>
                <tr>
                  <ResizableHeader label="CR" column="cr" width={crColumns.widths.cr} onResize={crColumns.startResize} />
                  <ResizableHeader label="Description" column="description" width={crColumns.widths.description} onResize={crColumns.startResize} />
                  <ResizableHeader label="Lifecycle" column="lifecycle" width={crColumns.widths.lifecycle} onResize={crColumns.startResize} />
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={requestKey(request)} className={selected === requestKey(request) ? "selected" : ""} onClick={() => onSelect(requestKey(request))}>
                    <td>{request.trkorr}</td>
                    <td>{request.description}</td>
                    <td><Status value={displayLifecycleStatus(request.lifecycle_status || request.status_group)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requests.length === 0 ? <div className="table-empty">No parent CR found for the current filter.</div> : null}
          </div>
          <div className="pagination">
            <span>{pageText(pagination)}</span>
            <select value={pagination.pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
              {[10, 25, 50, 100].map((size) => <option value={size} key={size}>{size} / page</option>)}
            </select>
            <button className="secondary" onClick={() => onPage(1)} disabled={pagination.page <= 1}>First</button>
            <button className="secondary" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page <= 1}>Prev</button>
            <button className="secondary" onClick={() => onPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</button>
            <button className="secondary" onClick={() => onPage(pagination.totalPages)} disabled={pagination.page >= pagination.totalPages}>Last</button>
          </div>
        </section>
        {hasDetail ? (
        <section className="detail-panel report-detail-panel">
          <button className="detail-close" type="button" onClick={onCloseDetail} aria-label="Close detail">×</button>
          <div className="detail-heading">
            <div>
              <h2>{displayRequest?.trkorr || "Select CR"}</h2>
              <p>{displayRequest?.description}</p>
            </div>
            {displayRequest ? <Status value={displayLifecycleStatusFromDetail(detail, displayRequest.lifecycle_status || displayRequest.status_group)} /> : null}
          </div>
          <div className="meta-grid">
            <span>Owner<strong>{displayRequest?.owner || "-"}</strong></span>
            <span>Target<strong>{displayRequest?.target_system || "-"}</strong></span>
            <span>Type<strong>{displayRequest?.function_code || "-"}</strong></span>
            <span>Changed<strong>{formatDate(displayRequest?.changed_date)}</strong></span>
          </div>
          <h3>Lifecycle</h3>
          <div className="issue-timeline cr-lifecycle-timeline">
            {[
              { label: "Created", value: formatDate(detail?.lifecycle.created_at), filled: Boolean(detail?.lifecycle.created_at) },
              { label: "Released", value: formatDate(detail?.lifecycle.released_at), filled: Boolean(detail?.lifecycle.released_at) },
              { label: "In QA", value: lifecycleLabel(detail?.lifecycle.qa_status, detail?.lifecycle.qa_imported_at), filled: detail?.lifecycle.qa_status === "imported" },
              { label: "In PRD", value: lifecycleLabel(detail?.lifecycle.prd_status, detail?.lifecycle.prd_imported_at), filled: detail?.lifecycle.prd_status === "imported" }
            ].map((event) => (
              <div className={`timeline-event ${event.filled ? "filled" : "missing"}`} key={event.label}>
                <span className="timeline-dot" />
                <div>
                  <small>{event.value || "-"}</small>
                  <strong>{event.label}</strong>
                </div>
              </div>
            ))}
          </div>
          <h3>Tasks</h3>
          <div className="rows compact">
            {(detail?.tasks || []).map((task) => (
              <div className="row task-row" key={task.trkorr}>
                <span>{task.trkorr}</span>
                <Status value={displayLifecycleStatus(task.lifecycle_status || task.status_group)} />
              </div>
            ))}
            {detail && detail.tasks.length === 0 ? <div className="empty">No child tasks cached.</div> : null}
          </div>
          <h3>Objects</h3>
          <div className="object-list se03-object-list">
            {groupObjectsBySe03Label(detail?.objects || []).map((group) => (
              <div className="object-group" key={group.key}>
                <div className="object-group-title">
                  <strong>{group.label}</strong>
                  <code>{group.key}</code>
                </div>
                {group.objects.map((object) => (
                  <div className="object-row se03-object-row" key={`${object.trkorr}-${object.position}`}>
                    <code>{object.pgmid} {object.object_type}</code>
                    <div>
                      <strong>{object.object_name}</strong>
                      <span>{object.trkorr} - {object.position}</span>
                      <small>{labelDiffReadiness(object.diff_readiness)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {detail && detail.objects.length === 0 ? <div className="empty">No objects cached for this CR.</div> : null}
          </div>
        </section>
        ) : null}
      </div>
    </>
  );
}

function IssueDisplay({
  issues,
  filters,
  pagination,
  selectedId,
  detail,
  onFilters,
  onSelect,
  onCloseDetail,
  onPage,
  onPageSize,
  onOpenCr
}: {
  issues: IssueRow[];
  filters: IssueFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  selectedId: number | null;
  detail: IssueDetail | null;
  onFilters: (filters: IssueFilters) => void;
  onSelect: (value: number) => void;
  onCloseDetail: () => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  onOpenCr: (link: { sap_system_code?: string; trkorr: string }) => void;
}) {
  const selectedIssue = issues.find((issue) => issue.id === selectedId) || detail?.issue || null;
  const hasDetail = Boolean(selectedId && selectedIssue);
  const issueColumns = useResizableColumns("issue-report-columns", {
    issue: 112,
    name: 320,
    glpi: 110,
    crHelpdesk: 140,
    cr: 140,
    status: 128,
    completeness: 48
  }, {
    issue: 100,
    name: 220,
    glpi: 90,
    crHelpdesk: 115,
    cr: 115,
    status: 115,
    completeness: 44
  });

  function updateFilter(key: keyof IssueFilters, value: string) {
    onFilters({ ...filters, [key]: value });
  }

  return (
    <>
      <section className="filterbar issue-filterbar">
        <select value={filters.status || "all"} onChange={(event) => updateFilter("status", event.target.value)}>
          <option value="all">All Status</option>
          <option value="ok">OK</option>
          <option value="in_progress">In Progress</option>
          <option value="open">Open</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input value={filters.q || ""} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search issue, requester, CR" />
        <input value={filters.glpi || ""} onChange={(event) => updateFilter("glpi", event.target.value)} placeholder="GLPI" />
        <input value={filters.crHelpdesk || ""} onChange={(event) => updateFilter("crHelpdesk", event.target.value)} placeholder="CR Helpdesk" />
        <input value={filters.cr || ""} onChange={(event) => updateFilter("cr", event.target.value)} placeholder="CR" />
        <input type="date" value={filters.fromDate || ""} onChange={(event) => updateFilter("fromDate", event.target.value)} />
        <input type="date" value={filters.toDate || ""} onChange={(event) => updateFilter("toDate", event.target.value)} />
      </section>

      <div className={`report-layout issue-layout ${hasDetail ? "" : "detail-closed"}`}>
        <section className="table-panel report-table-panel issue-table-panel">
          <div className="table-scroll">
            <table className="record-table issue-record-table" style={{ width: issueColumns.totalWidth, minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: issueColumns.widths.issue }} />
                <col style={{ width: issueColumns.widths.name }} />
                <col style={{ width: issueColumns.widths.glpi }} />
                <col style={{ width: issueColumns.widths.crHelpdesk }} />
                <col style={{ width: issueColumns.widths.cr }} />
                <col style={{ width: issueColumns.widths.status }} />
                <col style={{ width: issueColumns.widths.completeness }} />
              </colgroup>
              <thead>
                <tr>
                  <ResizableHeader label="Issue" column="issue" width={issueColumns.widths.issue} onResize={issueColumns.startResize} />
                  <ResizableHeader label="Name" column="name" width={issueColumns.widths.name} onResize={issueColumns.startResize} />
                  <ResizableHeader label="GLPI" column="glpi" width={issueColumns.widths.glpi} onResize={issueColumns.startResize} />
                  <ResizableHeader label="CR Helpdesk" column="crHelpdesk" width={issueColumns.widths.crHelpdesk} onResize={issueColumns.startResize} />
                  <ResizableHeader label="CR" column="cr" width={issueColumns.widths.cr} onResize={issueColumns.startResize} />
                  <ResizableHeader label="Status" column="status" width={issueColumns.widths.status} onResize={issueColumns.startResize} />
                  <ResizableHeader label="" column="completeness" width={issueColumns.widths.completeness} onResize={issueColumns.startResize} />
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} className={selectedId === issue.id ? "selected" : ""} onClick={() => onSelect(issue.id)}>
                    <td>{issue.issue_key}</td>
                    <td>{issue.issue_name}</td>
                    <td>{formatGlpi(issue.primary_glpi_ticket)}</td>
                    <td>{issue.primary_cr_helpdesk_no || "-"}</td>
                    <td>{issue.primary_cr || "-"}</td>
                    <td><Status value={issue.issue_status} /></td>
                    <td className="completeness-cell">{issue.issue_status === "cancelled" ? (
                      <span aria-label="Not applicable">-</span>
                    ) : (issue.missing_data_count || 0) === 0 ? (
                      <CheckCircle2 size={18} className="complete-icon" aria-label="Complete" />
                    ) : (
                      <AlertTriangle size={18} className="warning-icon" aria-label={`${issue.missing_data_count} missing item(s)`} />
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issues.length === 0 ? <div className="table-empty">No issue found for the current filter.</div> : null}
          </div>
          <div className="pagination">
            <span>{pageText(pagination)}</span>
            <select value={pagination.pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
              {[10, 25, 50, 100].map((size) => <option value={size} key={size}>{size} / page</option>)}
            </select>
            <button className="secondary" onClick={() => onPage(1)} disabled={pagination.page <= 1}>First</button>
            <button className="secondary" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page <= 1}>Prev</button>
            <button className="secondary" onClick={() => onPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</button>
            <button className="secondary" onClick={() => onPage(pagination.totalPages)} disabled={pagination.page >= pagination.totalPages}>Last</button>
          </div>
        </section>

        {hasDetail ? (
        <section className="detail-panel report-detail-panel issue-detail-panel">
          <button className="detail-close" type="button" onClick={onCloseDetail} aria-label="Close detail">×</button>
          <div className="detail-heading">
            <div>
              <h2>{selectedIssue?.issue_key || "Select Issue"}</h2>
              <p>{selectedIssue?.issue_name}</p>
            </div>
            {selectedIssue ? <Status value={selectedIssue.issue_status} /> : null}
          </div>

          <div className="meta-grid">
            <span className="wide-meta">Email Subject<strong>{detail?.issue?.email_subject || "-"}</strong></span>
            <span>Requester<strong>{selectedIssue?.requester_name_snapshot || "-"}</strong></span>
            <span>ABAPer<strong>{selectedIssue?.abaper_name_snapshot || "-"}</strong></span>
            <span>Created<strong>{formatIssueTimestamp(selectedIssue?.create_issue_date)}</strong></span>
            <GlpiMetaCard value={selectedIssue?.primary_glpi_ticket} />
            <span>CR Helpdesk No.<strong>{formatCrHelpdeskNumbers(detail) || selectedIssue?.primary_cr_helpdesk_no || "-"}</strong></span>
          </div>

          {detail?.issue?.issue_status === "cancelled" ? (
            <section className="issue-cancel-box">
              <strong>Cancel Reason</strong>
              <span>{detail.issue.cancelled_reason || "cancelled"}</span>
            </section>
          ) : null}

          {detail && detail.issue?.issue_status !== "cancelled" && missingIssueData(detail).length ? (
            <section className="issue-missing-box">
              <strong>Incomplete Data</strong>
              <ul>
                {missingIssueData(detail).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ) : null}

          <h3>Analysis</h3>
          <div className="analysis-block">
            <span>Problem</span>
            <p>{detail?.issue?.problem_analysis || "-"}</p>
            <span>Impact</span>
            <p>{detail?.issue?.impact_analysis || "-"}</p>
          </div>

          <h3>CR Links</h3>
          <div className="rows">
            {(detail?.crLinks || []).map((link) => (
              <button className="row issue-link-row issue-link-button" type="button" key={link.id} onClick={() => onOpenCr(link)}>
                <span>{link.trkorr}</span>
                <small>{link.cr_description_snapshot || "-"}</small>
              </button>
            ))}
            {detail && detail.crLinks.length === 0 ? <div className="empty">No CR linked.</div> : null}
          </div>

          <h3>Participants</h3>
          <div className="rows compact-participants">
            {participantGroups(detail?.participants || []).map((group) => (
              <section className="participant-phase" key={group.title}>
                <strong>{group.title}</strong>
                {group.roles.map((role) => {
                  const matches = group.participants.filter((participant) => participant.role === role);
                  return matches.length ? matches.map((participant) => (
                    <div className="row participant-row" key={participant.id}>
                      <span>{formatParticipantRole(role)}{participant.is_primary ? " *" : ""}</span>
                      <small>{participant.full_name || participant.person_name_snapshot}{participant.nickname ? ` (${participant.nickname})` : ""}</small>
                      <small>{participant.department || "-"}</small>
                    </div>
                  )) : (
                    <div className="row participant-row empty-participant" key={role}>
                      <span>{formatParticipantRole(role)}</span>
                      <small>-</small>
                      <small>-</small>
                    </div>
                  );
                })}
              </section>
            ))}
            {detail && detail.participants.length === 0 ? <div className="empty">No participants cached.</div> : null}
          </div>

          <h3>Timeline</h3>
          <div className="issue-timeline">
            {issueTimelineEvents(detail).map((event) => (
              <div className={`timeline-event ${event.date ? "filled" : "missing"}`} key={`${event.source}-${event.label}`}>
                <span className="timeline-dot" />
                <div>
                  <small>{event.date ? formatIssueTimestamp(event.date, event.time) : "-"}</small>
                  <strong>{event.source} - {event.label}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
        ) : null}
      </div>
    </>
  );
}

function IssueEditor({
  mode,
  detail,
  onSave,
  onCancel,
  onDelete,
  onDirtyChange
}: {
  mode: "create" | "change";
  detail: IssueDetail | null;
  onSave: (payload: IssueSavePayload) => Promise<void>;
  onCancel?: (id: number, reason: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [form, setForm] = useState<IssueSavePayload>(() => issueFormFromDetail(detail));
  const initialFormRef = useRef<IssueSavePayload>(issueFormFromDetail(detail));
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<"" | "cancel" | "delete">("");
  const [cancelReason, setCancelReason] = useState(detail?.issue?.cancelled_reason || "");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [actionDialog, setActionDialog] = useState<"" | "cancel" | "delete">("");
  const [nextIssueNo, setNextIssueNo] = useState<number | null>(null);
  const [createMode, setCreateMode] = useState<"new" | "sub">("new");
  const [baseIssueSearch, setBaseIssueSearch] = useState("");
  const [baseIssueCandidates, setBaseIssueCandidates] = useState<IssueRow[]>([]);
  const [showBaseIssueCandidates, setShowBaseIssueCandidates] = useState(false);
  const [crPreview, setCrPreview] = useState<Record<string, { description?: string; status?: string; system?: string }>>({});
  const [expandedPhases, setExpandedPhases] = useState({ dev: true, qa: false, prd: false });

  useEffect(() => {
    const nextForm = issueFormFromDetail(detail);
    initialFormRef.current = nextForm;
    setForm(nextForm);
    setCreateMode("new");
    setBaseIssueSearch("");
    setBaseIssueCandidates([]);
    setShowBaseIssueCandidates(false);
    setCrPreview({});
    setCancelReason(detail?.issue?.cancelled_reason || "");
    setDeleteConfirm("");
    setActionDialog("");
    onDirtyChange?.(false);
  }, [detail?.issue?.id, mode]);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(form) !== JSON.stringify(initialFormRef.current));
  }, [form, onDirtyChange]);

  useEffect(() => {
    if (mode !== "create") return;
    fetchNextIssueNumber().then((result) => setNextIssueNo(result.issueNo)).catch(() => setNextIssueNo(null));
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" || createMode !== "sub" || !baseIssueSearch.trim()) {
      setBaseIssueCandidates([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      fetchIssueCandidates({ q: baseIssueSearch })
        .then((rows) => setBaseIssueCandidates(rows))
        .catch(() => setBaseIssueCandidates([]));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [mode, createMode, baseIssueSearch]);

  function update(key: keyof IssueSavePayload, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateParticipant(role: string, value: string) {
    setForm((current) => ({ ...current, participants: { ...(current.participants || {}), [role]: value } }));
  }

  function updateTimeline(key: string, value: string) {
    setForm((current) => ({ ...current, timeline: { ...(current.timeline || {}), [key]: value } }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isCancelled) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        createMode: mode === "create" ? createMode : undefined,
        issueNo: mode === "create" && createMode === "new" ? undefined : form.issueNo
      });
    } finally {
      setSaving(false);
    }
  }

  async function selectBaseIssue(issue: IssueRow) {
    setBaseIssueSearch(issue.issue_key);
    setShowBaseIssueCandidates(false);
    try {
      const next = await fetchNextSubIssueNumber(issue.issue_no);
      setForm((current) => ({
        ...current,
        createMode: "sub",
        issueNo: issue.issue_no,
        subIssueNo: next.subIssueNo
      }));
    } catch {
      setForm((current) => ({ ...current, createMode: "sub", issueNo: issue.issue_no, subIssueNo: "01" }));
    }
  }

  const primaryCr = detail?.crLinks[0];
  const crTokens = splitTokenValues(form.crLinks);
  const hasCrAssigned = crTokens.length > 0;
  const primaryLifecycle = primaryCr?.lifecycle_status;
  const qaReady = Boolean(primaryCr?.qa_import_date || ["in_qa", "pending_prd", "in_prd"].includes(primaryLifecycle || ""));
  const prdReady = Boolean(primaryCr?.prd_import_date || primaryLifecycle === "in_prd");
  const displayedIssueNo = mode === "create" && createMode === "new" ? nextIssueNo || "" : form.issueNo || "";
  const displayedSubIssueNo = form.subIssueNo || "01";
  const issueKey = detail?.issue?.issue_key || [displayedIssueNo, displayedSubIssueNo].filter(Boolean).join("-");
  const isCancelled = (detail?.issue?.issue_status || form.sourceIssueStatus) === "cancelled";
  const formDisabled = mode === "change" && isCancelled;
  const devDisabled = isCancelled || !hasCrAssigned;
  const qaDisabled = isCancelled || !qaReady;
  const prdRequestDisabled = isCancelled || !qaReady;
  const prdTransportDisabled = isCancelled || !prdReady;
  const detailCrMap = new Map((detail?.crLinks || []).map((link) => [link.trkorr, {
    description: link.cr_description_snapshot,
    status: link.lifecycle_status || link.status_group,
    system: link.sap_system_code
  }]));

  function previewForCr(trkorr: string) {
    return crPreview[trkorr] || detailCrMap.get(trkorr);
  }

  useEffect(() => {
    setExpandedPhases({
      dev: hasCrAssigned,
      qa: qaReady,
      prd: prdReady
    });
  }, [detail?.issue?.id, hasCrAssigned, qaReady, prdReady]);

  function togglePhase(phase: keyof typeof expandedPhases) {
    setExpandedPhases((current) => ({ ...current, [phase]: !current[phase] }));
  }

  async function cancelCurrentIssue() {
    if (!detail?.issue || !onCancel) return;
    const reason = cancelReason.trim();
    if (!reason) return;
    const confirmed = window.confirm(`Cancel issue ${detail.issue.issue_key} and remove all linked CR SAP numbers?`);
    if (!confirmed) return;
    setActionBusy("cancel");
    try {
      await onCancel(detail.issue.id, reason);
      setActionDialog("");
    } finally {
      setActionBusy("");
    }
  }

  async function deleteCurrentIssue() {
    if (!detail?.issue || !onDelete || deleteConfirm.trim() !== detail.issue.issue_key) return;
    const confirmed = window.confirm(`Delete issue ${detail.issue.issue_key}? This will permanently remove the issue from the database.`);
    if (!confirmed) return;
    setActionBusy("delete");
    try {
      await onDelete(detail.issue.id);
      setActionDialog("");
    } finally {
      setActionBusy("");
    }
  }

  if (mode === "change" && !detail?.issue) {
    return <section className="panel issue-editor-panel"><h2>Change Issue</h2><p className="empty">Pilih issue dari menu Display terlebih dahulu.</p></section>;
  }

  return (
    <form className="issue-editor-panel" onSubmit={submit}>
      {mode === "create" ? (
        <section className="panel editor-section issue-editor-title">
          <div className="panel-heading">
            <h2>Create Issue</h2>
          </div>
          <div className="issue-mode-panel">
            <div className="issue-mode-options">
              <button type="button" className={createMode === "new" ? "active" : ""} onClick={() => {
                setCreateMode("new");
                setForm((current) => ({ ...current, createMode: "new", issueNo: undefined, subIssueNo: "01" }));
              }}>
                New Issue
              </button>
              <button type="button" className={createMode === "sub" ? "active" : ""} onClick={() => {
                setCreateMode("sub");
                setForm((current) => ({ ...current, createMode: "sub" }));
                setShowBaseIssueCandidates(true);
              }}>
                Add Sub Issue
              </button>
            </div>
            {createMode === "new" ? (
              <p>Next issue preview: <strong>{nextIssueNo || "-"}</strong>-01</p>
            ) : (
              <div className="base-issue-picker">
                <label>Existing Issue
                  <input
                    value={baseIssueSearch}
                    onFocus={() => setShowBaseIssueCandidates(true)}
                    onChange={(event) => {
                      setBaseIssueSearch(event.target.value);
                      setShowBaseIssueCandidates(true);
                    }}
                    placeholder="Search issue no, description, requester"
                  />
                </label>
                {showBaseIssueCandidates ? (
                  <div className="base-issue-results">
                    {baseIssueCandidates.map((issue) => (
                      <button type="button" key={issue.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectBaseIssue(issue)}>
                        <strong>{issue.issue_key}</strong>
                        <span>{issue.issue_name}</span>
                        <small>{[issue.primary_cr, formatGlpi(issue.primary_glpi_ticket), formatStatusLabel(issue.issue_status)].filter(Boolean).join(" - ")}</small>
                      </button>
                    ))}
                    {baseIssueSearch.trim() && baseIssueCandidates.length === 0 ? <span>No issue found</span> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="panel editor-section issue-phase-card">
        <div className="phase-title">
          <div>
            <h2>Issue Initiation</h2>
            <p>Initial issue details, analysis, requester, ABAPer, and supporting references.</p>
          </div>
        </div>
        <div className="issue-initiation-layout">
          <div className="issue-initiation-column issue-initiation-main">
            <div className="initiation-pair">
              <label>Issue No.<input className="readonly-input" value={displayedIssueNo} onChange={(event) => update("issueNo", event.target.value)} placeholder="Auto" readOnly={mode === "create"} disabled={formDisabled} /></label>
              <label>Sub Issue<input className={mode === "create" ? "readonly-input" : ""} value={displayedSubIssueNo} onChange={(event) => update("subIssueNo", event.target.value)} readOnly={mode === "create"} disabled={formDisabled} /></label>
            </div>
            <label>Issue Name<input value={form.issueName || ""} onChange={(event) => update("issueName", event.target.value)} required disabled={formDisabled} /></label>
            <div className="initiation-pair">
              <label>Status<select value={form.sourceIssueStatus || "open"} onChange={(event) => update("sourceIssueStatus", event.target.value)} disabled={formDisabled}>
                <option value="open">Open</option>
                <option value="ok">OK</option>
                {isCancelled ? <option value="cancelled">Cancelled</option> : null}
              </select></label>
              <label>Created On<input type="datetime-local" value={toDatetimeInput(form.createIssueDate)} onChange={(event) => update("createIssueDate", event.target.value)} disabled={formDisabled} /></label>
            </div>
            <label>Email Subject<input value={form.emailSubject || ""} onChange={(event) => update("emailSubject", event.target.value)} placeholder="Email subject" disabled={formDisabled} /></label>
            <label>Problem Analysis<textarea value={form.problemAnalysis || ""} onChange={(event) => update("problemAnalysis", event.target.value)} rows={6} disabled={formDisabled} /></label>
            <label>Impact Analysis<textarea value={form.impactAnalysis || ""} onChange={(event) => update("impactAnalysis", event.target.value)} rows={6} disabled={formDisabled} /></label>
          </div>

          <div className="issue-initiation-column issue-initiation-reference">
            <div className="initiation-pair">
              <ValueHelpField label="CR Helpdesk No." kind="cr-helpdesk" value={form.crHelpdeskNumbers || ""} onChange={(value) => update("crHelpdeskNumbers", value)} placeholder="CR Helpdesk No." disabled={formDisabled} />
              <ValueHelpField label="GLPI No." kind="glpi" value={form.glpiTickets || ""} onChange={(value) => update("glpiTickets", value)} placeholder="16095; 16096" disabled={formDisabled} />
            </div>
            <ValueHelpField
              label="CR SAP No."
              kind="cr"
              value={form.crLinks || ""}
              onChange={(value) => update("crLinks", value.toUpperCase())}
              onSelectRow={(row) => {
                const trkorr = String(row.trkorr || "");
                if (!trkorr) return;
                setCrPreview((current) => ({
                  ...current,
                  [trkorr]: {
                    description: String(row.description || ""),
                    status: String(row.status_group || ""),
                    system: String(row.sap_system_code || "")
                  }
                }));
              }}
              placeholder="TRDK..."
              disabled={formDisabled}
            />
            {crTokens.length ? (
              <div className="cr-inline-preview">
                {crTokens.map((trkorr) => {
                  const preview = previewForCr(trkorr);
                  const description = preview?.description || "Description will appear after the CR is cached/selected.";
                  const status = preview?.status ? formatStatusLabel(preview.status) : "Status unknown";
                  return (
                    <div className="cr-description-card" key={trkorr}>
                      <span>{description}</span>
                      <strong>{status}</strong>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div className="repeatable-row-field">
              <MultiValueHelpField label="Requester" kind="people" value={form.requesterNames || ""} onChange={(value) => update("requesterNames", value)} placeholder="Full name" disabled={formDisabled} />
            </div>
            <div className="repeatable-row-field">
              <MultiValueHelpField label="ABAPer" kind="people" value={form.abaperNames || ""} onChange={(value) => update("abaperNames", value)} placeholder="Full name" disabled={formDisabled} />
            </div>
            {isCancelled ? (
              <section className="issue-cancel-card">
                <small>Cancel Reason</small>
                <strong>{form.cancelledReason || detail?.issue?.cancelled_reason || "-"}</strong>
              </section>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`panel editor-section issue-phase-card ${hasCrAssigned ? "" : "phase-muted"}`}>
        <button className="phase-title phase-toggle" type="button" onClick={() => togglePhase("dev")}>
          <div>
            <h2>DEV Processing</h2>
            <p>Testing and evaluation in the DEV system.</p>
          </div>
          <span className="phase-title-actions">
            <span className={`phase-badge ${isCancelled ? "cancelled" : hasCrAssigned ? "active" : "waiting"}`}>{isCancelled ? "Cancelled" : hasCrAssigned ? "Ready" : "Waiting CR"}</span>
            <span className="phase-chevron">{expandedPhases.dev ? "Hide" : "Show"}</span>
          </span>
        </button>
        {expandedPhases.dev ? (
          <div className="phase-pair-grid">
            <ValueHelpField label="DEV Tester" kind="people" value={form.participants?.dev_tester || ""} onChange={(value) => updateParticipant("dev_tester", value)} placeholder="Nickname; nickname" disabled={devDisabled} />
            <label>Testing Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.dev_tested_date)} onChange={(event) => updateTimeline("dev_tested_date", event.target.value)} disabled={devDisabled} /></label>
            <ValueHelpField label="DEV Evaluator" kind="people" value={form.participants?.dev_evaluator || ""} onChange={(value) => updateParticipant("dev_evaluator", value)} placeholder="Nickname; nickname" disabled={devDisabled} />
            <label>Evaluation Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.dev_evaluated_date)} onChange={(event) => updateTimeline("dev_evaluated_date", event.target.value)} disabled={devDisabled} /></label>
          </div>
        ) : null}
      </section>

      <section className={`panel editor-section issue-phase-card ${qaReady ? "" : "phase-muted"}`}>
        <button className="phase-title phase-toggle" type="button" onClick={() => togglePhase("qa")}>
          <div>
            <h2>QA Processing</h2>
            <p>Testing and evaluation in the QA system.</p>
          </div>
          <span className="phase-title-actions">
            <span className={`phase-badge ${isCancelled ? "cancelled" : qaReady ? "active" : "waiting"}`}>{isCancelled ? "Cancelled" : qaReady ? "In QA" : "Not yet in QA"}</span>
            <span className="phase-chevron">{expandedPhases.qa ? "Hide" : "Show"}</span>
          </span>
        </button>
        {expandedPhases.qa ? (
          <div className="phase-pair-grid">
            <ValueHelpField label="QA Transporter" kind="people" value={form.participants?.qa_transporter || ""} onChange={(value) => updateParticipant("qa_transporter", value)} placeholder="Nickname; nickname" disabled={qaDisabled} />
            <label>Transport Date<input className="readonly-input" value={formatIssueTimestamp(primaryCr?.qa_import_date, primaryCr?.qa_import_time)} readOnly /></label>
            <ValueHelpField label="QA Tester" kind="people" value={form.participants?.qa_tester || ""} onChange={(value) => updateParticipant("qa_tester", value)} placeholder="Nickname; nickname" disabled={qaDisabled} />
            <label>Testing Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.qa_tested_date)} onChange={(event) => updateTimeline("qa_tested_date", event.target.value)} disabled={qaDisabled} /></label>
            <ValueHelpField label="QA Evaluator" kind="people" value={form.participants?.qa_evaluator || ""} onChange={(value) => updateParticipant("qa_evaluator", value)} placeholder="Nickname; nickname" disabled={qaDisabled} />
            <label>Evaluation Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.qa_evaluated_date)} onChange={(event) => updateTimeline("qa_evaluated_date", event.target.value)} disabled={qaDisabled} /></label>
          </div>
        ) : null}
      </section>

      <section className={`panel editor-section issue-phase-card ${prdReady ? "" : "phase-muted"}`}>
        <button className="phase-title phase-toggle" type="button" onClick={() => togglePhase("prd")}>
          <div>
            <h2>PRD Processing</h2>
            <p>PRD request, evaluation, approval, and transport execution.</p>
          </div>
          <span className="phase-title-actions">
            <span className={`phase-badge ${isCancelled ? "cancelled" : prdReady ? "active" : "waiting"}`}>{isCancelled ? "Cancelled" : prdReady ? "In PRD" : "Not yet in PRD"}</span>
            <span className="phase-chevron">{expandedPhases.prd ? "Hide" : "Show"}</span>
          </span>
        </button>
        {expandedPhases.prd ? (
          <div className="phase-pair-grid">
            <ValueHelpField label="PRD Requester" kind="people" value={form.participants?.prd_requester || ""} onChange={(value) => updateParticipant("prd_requester", value)} placeholder="Nickname; nickname" disabled={prdRequestDisabled} />
            <label>Request Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.prd_requested_date)} onChange={(event) => updateTimeline("prd_requested_date", event.target.value)} disabled={prdRequestDisabled} /></label>
            <ValueHelpField label="PRD Evaluator" kind="people" value={form.participants?.prd_evaluator || ""} onChange={(value) => updateParticipant("prd_evaluator", value)} placeholder="Nickname; nickname" disabled={prdRequestDisabled} />
            <label>Evaluation Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.prd_evaluated_date)} onChange={(event) => updateTimeline("prd_evaluated_date", event.target.value)} disabled={prdRequestDisabled} /></label>
            <ValueHelpField label="Approver" kind="people" value={form.participants?.approval || ""} onChange={(value) => updateParticipant("approval", value)} placeholder="Nickname; nickname" disabled={prdRequestDisabled} />
            <label>Approval Date<input type="datetime-local" value={toDatetimeInput(form.timeline?.approval_date)} onChange={(event) => updateTimeline("approval_date", event.target.value)} disabled={prdRequestDisabled} /></label>
            <ValueHelpField label="PRD Transporter" kind="people" value={form.participants?.executor || ""} onChange={(value) => updateParticipant("executor", value)} placeholder="Nickname; nickname" disabled={prdTransportDisabled} />
            <label>Transport Date<input className="readonly-input" value={formatIssueTimestamp(primaryCr?.prd_import_date, primaryCr?.prd_import_time)} readOnly /></label>
          </div>
        ) : null}
      </section>
      <div className="issue-save-bar">
        <span>Actions</span>
        <div className="sticky-actions">
          {mode === "change" && detail?.issue ? (
            <>
              {!isCancelled ? (
                <button className="danger-secondary" type="button" onClick={() => setActionDialog("cancel")}>Cancel Issue</button>
              ) : (
                <span className="readonly-note">Cancelled issue is read-only.</span>
              )}
              <button className="danger" type="button" onClick={() => setActionDialog("delete")}>Delete Issue</button>
            </>
          ) : null}
          {!isCancelled ? <button className="primary" type="submit" disabled={saving}>{saving ? "Saving" : "Save"}</button> : null}
        </div>
      </div>
      {actionDialog ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="issue-action-title">
            {actionDialog === "cancel" ? (
              <>
                <h2 id="issue-action-title">Cancel Issue {issueKey}</h2>
                <p>Issue will be marked as cancelled and all linked CR SAP numbers will be detached. The issue history will remain available.</p>
                <label>Cancel Reason
                  <textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Reason for cancelling this issue" rows={4} autoFocus />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary" onClick={() => setActionDialog("")}>Close</button>
                  <button type="button" className="danger-secondary" disabled={!cancelReason.trim() || actionBusy === "cancel"} onClick={cancelCurrentIssue}>
                    {actionBusy === "cancel" ? "Cancelling" : "Confirm Cancel"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="issue-action-title">Delete Issue {issueKey}</h2>
                <p>This will permanently delete the issue from the database. Type the full issue number to confirm.</p>
                <label>Confirmation
                  <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder={issueKey} autoFocus />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary" onClick={() => setActionDialog("")}>Close</button>
                  <button type="button" className="danger" disabled={deleteConfirm.trim() !== issueKey || actionBusy === "delete"} onClick={deleteCurrentIssue}>
                    {actionBusy === "delete" ? "Deleting" : "Confirm Delete"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </form>
  );
}

function ChangeIssue({
  onSave,
  onCancel,
  onDelete,
  onNotify,
  onDirtyChange
}: {
  onSave: (payload: IssueSavePayload) => Promise<void>;
  onCancel: (id: number, reason: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onNotify: (type: "success" | "error", message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [selection, setSelection] = useState({ q: "", glpi: "", crHelpdesk: "", cr: "" });
  const [candidates, setCandidates] = useState<IssueRow[]>([]);
  const [changeDetail, setChangeDetail] = useState<IssueDetail | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchKey = `${selection.q.trim()}|${selection.glpi.trim()}|${selection.crHelpdesk.trim()}|${selection.cr.trim()}`;

  useEffect(() => {
    if (!selection.q.trim() && !selection.glpi.trim() && !selection.crHelpdesk.trim() && !selection.cr.trim()) {
      setCandidates([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      fetchIssueCandidates(selection)
        .then((rows) => setCandidates(rows))
        .catch(() => setCandidates([]));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [searchKey]);

  function updateSelection(key: keyof typeof selection, value: string) {
    setSelection((current) => ({ ...current, [key]: key === "cr" ? value.toUpperCase() : value }));
    setShowCandidates(true);
  }

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setSearched(true);
    setShowCandidates(true);
    if (!selection.q.trim() && !selection.glpi.trim() && !selection.crHelpdesk.trim() && !selection.cr.trim()) {
      onNotify("error", "Isi minimal Issue, CR Helpdesk, CR SAP, GLPI, atau deskripsi sebelum Search.");
      setCandidates([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await fetchIssueCandidates(selection);
      setCandidates(rows);
      if (!rows.length) {
        onNotify("error", "Issue tidak ditemukan.");
        return;
      }
      await openIssue(rows[0]);
      if (rows.length > 1) onNotify("success", `${rows.length} issue ditemukan. Issue pertama ditampilkan, pilih kandidat lain jika perlu.`);
    } catch (err) {
      onNotify("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  async function openIssue(issue: IssueRow) {
    const nextDetail = await fetchIssueDetail(issue.id);
    setChangeDetail(nextDetail);
    setShowCandidates(false);
  }

  const missing = changeDetail?.issue && changeDetail.issue.issue_status !== "cancelled" ? missingIssueData(changeDetail) : [];

  return (
    <div className="issue-change-layout">
      <form className="panel issue-selection-panel" onSubmit={search}>
        <div className="panel-heading">
          <h2>Selection Parameter</h2>
          <button className="primary" type="submit" disabled={searching}>{searching ? "Searching" : "Search"}</button>
        </div>
        <div className="issue-selection-grid">
          <label>Issue / Description / Requester
            <input value={selection.q} onChange={(event) => updateSelection("q", event.target.value)} placeholder="Issue no, description, requester" />
          </label>
          <label>GLPI
            <input value={selection.glpi} onChange={(event) => updateSelection("glpi", event.target.value)} placeholder="15293" />
          </label>
          <label>CR Helpdesk No.
            <input value={selection.crHelpdesk} onChange={(event) => updateSelection("crHelpdesk", event.target.value)} placeholder="CR Helpdesk No." />
          </label>
          <label>CR
            <input value={selection.cr} onChange={(event) => updateSelection("cr", event.target.value)} placeholder="TRDK..." />
          </label>
        </div>
        {showCandidates ? (
          <div className="issue-candidate-list">
            {candidates.map((issue) => (
              <button type="button" key={issue.id} className={changeDetail?.issue?.id === issue.id ? "selected" : ""} onClick={() => openIssue(issue).catch((err) => onNotify("error", err instanceof Error ? err.message : String(err)))}>
                <strong>{issue.issue_key}</strong>
                <span>{issue.issue_name}</span>
                <small>{[issue.primary_cr, issue.primary_cr_helpdesk_no, formatGlpi(issue.primary_glpi_ticket), formatStatusLabel(issue.issue_status)].filter(Boolean).join(" - ")}</small>
              </button>
            ))}
            {searched && !searching && candidates.length === 0 ? <span className="empty">No issue found.</span> : null}
          </div>
        ) : null}
      </form>

      {changeDetail?.issue ? (
        <section className="panel issue-change-summary">
          <div className="change-summary-main">
            <div>
              <strong>{changeDetail.issue.issue_key}</strong>
              <span>{changeDetail.issue.issue_name}</span>
            </div>
            <Status value={changeDetail.issue.issue_status} />
          </div>
          {missing.length ? (
            <details className="change-summary-details">
              <summary>{missing.length} incomplete item(s)</summary>
              <ul>
                {missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {changeDetail ? <IssueEditor mode="change" detail={changeDetail} onSave={onSave} onCancel={onCancel} onDelete={onDelete} onDirtyChange={onDirtyChange} /> : null}
    </div>
  );
}

function ValueHelpField({
  label,
  kind,
  value,
  onChange,
  placeholder,
  disabled = false,
  onSelectRow
}: {
  label: string;
  kind: ValueHelpKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSelectRow?: (row: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      fetchValueHelp(kind, lastToken(query))
        .then((result) => setRows(result.rows))
        .catch(() => setRows([]));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [open, query, kind]);

  function choose(row: Record<string, unknown>) {
    const selected = valueHelpValue(kind, row);
    onChange(appendToken(value, selected));
    onSelectRow?.(row);
    setOpen(false);
  }

  return (
    <label
      className="value-help-field"
      onBlurCapture={(event) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (!nextFocus || !event.currentTarget.contains(nextFocus)) setOpen(false);
      }}
    >
      {label}
      <input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        onChange={(event) => {
          if (disabled) return;
          setQuery(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div className="value-help-menu">
          {rows.map((row, index) => (
            <button type="button" key={index} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(row)}>
              <strong>{valueHelpValue(kind, row)}</strong>
              <small>{valueHelpDescription(kind, row)}</small>
            </button>
          ))}
          {rows.length === 0 ? <span>No value found</span> : null}
        </div>
      ) : null}
    </label>
  );
}

function MultiValueHelpField({
  label,
  kind,
  value,
  onChange,
  placeholder,
  disabled = false
}: {
  label: string;
  kind: ValueHelpKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const rows = value ? value.split(/[;,]/).map((item) => item.trim()) : [];
  const visibleRows = rows.length ? rows : [""];

  function commit(nextRows: string[]) {
    onChange(nextRows.map((item) => item.trim()).filter(Boolean).join("; "));
  }

  function updateRow(index: number, nextValue: string) {
    const nextRows = [...visibleRows];
    nextRows[index] = nextValue;
    commit(nextRows);
  }

  function removeRow(index: number) {
    commit(visibleRows.filter((_, rowIndex) => rowIndex !== index));
  }

  function addRow() {
    onChange(value.trim() ? `${value.replace(/\s*$/, "")}; ` : "");
  }

  return (
    <div className="multi-value-field">
      <div className="multi-value-heading">
        <span>{label}</span>
        <button type="button" className="mini-action" onClick={addRow} disabled={disabled}>+ Add</button>
      </div>
      {visibleRows.map((rowValue, index) => (
        <div className="multi-value-row" key={`${label}-${index}`}>
          <ValueHelpField
            label={`${label} ${index + 1}`}
            kind={kind}
            value={rowValue}
            onChange={(nextValue) => updateRow(index, nextValue)}
            placeholder={placeholder}
            disabled={disabled}
          />
          <button type="button" className="icon-action" onClick={() => removeRow(index)} disabled={disabled || visibleRows.length === 1}>-</button>
        </div>
      ))}
    </div>
  );
}

async function fetchIssueCandidates(selection: { q?: string; glpi?: string; crHelpdesk?: string; cr?: string }) {
  const result = await fetchIssueList({
    status: "all",
    q: selection.q?.trim() || undefined,
    glpi: selection.glpi?.trim() || undefined,
    crHelpdesk: selection.crHelpdesk?.trim() || undefined,
    cr: selection.cr?.trim() || undefined,
    page: 1,
    pageSize: 8
  });
  return result.rows;
}

function Status({ value }: { value?: string }) {
  return <span className={`status ${value || "unknown"}`}>{formatStatusLabel(value)}</span>;
}

function requestKey(request: CrRequest) {
  return `${request.sap_system_code}:${request.trkorr}`;
}

function parseRequestKey(value: string) {
  const [sapSystemCode, ...rest] = value.split(":");
  return {
    sapSystemCode: sapSystemCode || "DEV",
    trkorr: rest.join(":")
  };
}

function systemLabel(system: SapSystemConfig) {
  return `${system.code} - ${system.server || "-"} - ${system.owner || "-"}`;
}

function toggleSystem(current: string[], code: string) {
  if (current.includes(code)) {
    return current.length === 1 ? current : current.filter((item) => item !== code);
  }
  return [...current, code];
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function lifecycleLabel(status?: string, value?: string) {
  if (status === "imported") return formatDate(value);
  if (status === "failed") return "Failed";
  return "-";
}

function formatStatusLabel(value?: string) {
  switch (value) {
    case "created":
      return "Created";
    case "ok":
      return "OK";
    case "in_progress":
      return "In Progress";
    case "open":
      return "Open";
    case "cancelled":
      return "Cancelled";
    case "pending_qa":
      return "Pending to QA";
    case "in_qa":
      return "In QA";
    case "pending_prd":
      return "Pending to PRD";
    case "in_prd":
      return "In PRD";
    default:
      return value || "unknown";
  }
}

function displayLifecycleStatus(value?: string) {
  switch (value) {
    case "in_prd":
      return "in_prd";
    case "pending_prd":
    case "in_qa":
      return "in_qa";
    case "pending_qa":
    case "released":
      return "released";
    case "outstanding":
    case "created":
      return "created";
    default:
      return value || "unknown";
  }
}

function displayLifecycleStatusFromDetail(detail: CrDetail | null, fallback?: string) {
  if (detail?.lifecycle.prd_status === "imported") return "in_prd";
  if (detail?.lifecycle.qa_status === "imported") return "in_qa";
  if (detail?.lifecycle.released_at) return "released";
  if (detail?.lifecycle.created_at) return "created";
  return displayLifecycleStatus(fallback);
}

function formatDateTime(value?: string) {
  const date = parseAppTimestamp(value);
  return date ? date.toLocaleString() : "-";
}

function formatIssueTimestamp(value?: string, time?: string) {
  if (!value) return "-";
  const date = parseAppTimestamp(value, time || "08:00:00");
  return date ? date.toLocaleString() : "-";
}

function groupObjectsBySe03Label(objects: CrDetail["objects"]) {
  const groups = new Map<string, { key: string; label: string; objects: CrDetail["objects"] }>();
  for (const object of objects) {
    const key = `${object.pgmid || "-"} ${object.object_type || "-"}`;
    const label = se03ObjectLabel(object.pgmid, object.object_type);
    if (!groups.has(key)) groups.set(key, { key, label, objects: [] });
    groups.get(key)!.objects.push(object);
  }
  return [...groups.values()];
}

function se03ObjectLabel(pgmid?: string, objectType?: string) {
  const key = `${pgmid || ""} ${objectType || ""}`.trim().toUpperCase();
  const labels: Record<string, string> = {
    "CORR RELE": "Release information",
    "LIMU REPS": "Source/include ABAP",
    "LIMU REPT": "Program text",
    "LIMU CINC": "Class include",
    "LIMU CPUB": "Class public section",
    "LIMU CPRI": "Class private section",
    "LIMU CPRO": "Class protected section",
    "LIMU METH": "Class method",
    "LIMU FUNC": "Function module",
    "LIMU FUGT": "Function group text",
    "R3TR PROG": "Program",
    "R3TR FUGR": "Function group",
    "R3TR CLAS": "Class",
    "R3TR INTF": "Interface",
    "R3TR TABL": "Table",
    "R3TR VIEW": "View",
    "R3TR DTEL": "Data element",
    "R3TR DOMA": "Domain",
    "R3TR TTYP": "Table type",
    "R3TR SHLP": "Search help",
    "R3TR TRAN": "Transaction",
    "R3TR MSAG": "Message class",
    "R3TR ENHO": "Enhancement implementation",
    "R3TR ENHS": "Enhancement spot"
  };
  return labels[key] || `${objectType || "Object"} (${pgmid || "-"})`;
}

function labelDiffReadiness(value?: string) {
  switch (value) {
    case "source_snapshot_or_version_compare":
      return "Source/version compare";
    case "ddic_snapshot_or_version_compare":
      return "DDIC compare";
    case "repository_subobject_compare":
      return "Repository subobject";
    default:
      return "Inventory only";
  }
}

function pageText(pagination: { page: number; pageSize: number; total: number }) {
  if (!pagination.total) return "Showing 0 of 0";
  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.total);
  return `Showing ${start}-${end} of ${pagination.total}`;
}

function reportFilterKey(value: CrFilters) {
  return [
    value.status || "all",
    value.lifecycleStatus || "all",
    value.q?.trim() || "",
    value.fromDate || "",
    value.toDate || "",
    value.pageSize || 25
  ].join("|");
}

function issueFilterKey(value: IssueFilters) {
  return [
    value.status || "all",
    value.q?.trim() || "",
    value.requester?.trim() || "",
    value.abaper?.trim() || "",
    value.cr?.trim() || "",
    value.glpi?.trim() || "",
    value.crHelpdesk?.trim() || "",
    value.fromDate || "",
    value.toDate || "",
    value.pageSize || 25
  ].join("|");
}

function GlpiMetaCard({ value }: { value?: number }) {
  if (!value) {
    return <span>GLPI<strong>-</strong></span>;
  }
  return (
    <a
      className="glpi-meta-card"
      href={glpiUrl(value)}
      target="_blank"
      rel="noreferrer"
    >
      GLPI<strong>{value}</strong>
    </a>
  );
}

function glpiUrl(value: number) {
  return `https://itsm.trst.co.id/front/ticket.form.php?id=${value}`;
}

function formatGlpi(value?: number) {
  if (!value) return "-";
  return String(value);
}

function formatCrHelpdeskNumbers(detail: IssueDetail | null) {
  return detail?.crHelpdeskNumbers.map((item) => item.cr_helpdesk_no).join("; ") || "";
}

function issueFormFromDetail(detail: IssueDetail | null): IssueSavePayload {
  const issue = detail?.issue;
  const participants = Object.fromEntries(
    PARTICIPANT_GROUPS.flatMap((group) => group.roles).map((role) => [
      role,
      detail?.participants
        .filter((participant) => participant.role === role)
        .map((participant) => participant.full_name || participant.nickname || participant.person_name_snapshot)
        .join("; ") || ""
    ])
  ) as Record<string, string>;

  return {
    id: issue?.id,
    issueNo: issue?.issue_no,
    subIssueNo: issue?.sub_issue_no || "01",
    issueName: issue?.issue_name || "",
    requesterNames: participants.requester || issue?.requester_name_snapshot || "",
    abaperNames: participants.abaper || issue?.abaper_name_snapshot || "",
    problemAnalysis: issue?.problem_analysis || "",
    impactAnalysis: issue?.impact_analysis || "",
    emailSubject: issue?.email_subject || "",
    createIssueDate: toDatetimeInput(issue?.create_issue_date) || currentDatetimeInput(),
    sourceIssueStatus: issue?.source_issue_status || (issue?.issue_status === "cancelled" ? "cancelled" : "open"),
    cancelledDate: toDatetimeInput(issue?.cancelled_date) || "",
    cancelledReason: issue?.cancelled_reason || "",
    glpiTickets: detail?.glpi.map((ticket) => ticket.ticket_number).join("; ") || "",
    crHelpdeskNumbers: detail?.crHelpdeskNumbers.map((item) => item.cr_helpdesk_no).join("; ") || "",
    crLinks: detail?.crLinks.map((link) => link.trkorr).join("; ") || "",
    participants,
    timeline: {
      dev_tested_date: toDatetimeInput(readTimelineDate(detail?.devTimeline, "dev_tested_date")),
      dev_evaluated_date: toDatetimeInput(readTimelineDate(detail?.devTimeline, "dev_evaluated_date")),
      qa_tested_date: toDatetimeInput(readTimelineDate(detail?.qaTimeline, "qa_tested_date")),
      qa_evaluated_date: toDatetimeInput(readTimelineDate(detail?.qaTimeline, "qa_evaluated_date")),
      prd_requested_date: toDatetimeInput(readTimelineDate(detail?.prdTimeline, "prd_requested_date")),
      prd_evaluated_date: toDatetimeInput(readTimelineDate(detail?.prdTimeline, "prd_evaluated_date")),
      approval_date: toDatetimeInput(readTimelineDate(detail?.prdTimeline, "approval_date"))
    }
  };
}

function valueHelpValue(kind: ValueHelpKind, row: Record<string, unknown>) {
  if (kind === "glpi") return String(row.ticket_number || "");
  if (kind === "cr-helpdesk") return String(row.cr_helpdesk_no || "");
  if (kind === "cr") return String(row.trkorr || "");
  return String(row.full_name || row.nickname || "");
}

function valueHelpDescription(kind: ValueHelpKind, row: Record<string, unknown>) {
  if (kind === "glpi") return "GLPI ticket";
  if (kind === "cr-helpdesk") return "CR Helpdesk No.";
  if (kind === "cr") return [row.sap_system_code, row.status_group, row.description].filter(Boolean).join(" - ");
  return [row.nickname, row.department, row.email].filter(Boolean).join(" - ");
}

function splitTokenValues(value?: string) {
  return (value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function lastToken(value: string) {
  return value.split(/[;,]/).pop()?.trim() || "";
}

function appendToken(current: string, selected: string) {
  const parts = current.split(/([;,])/);
  let lastTextIndex = parts.length - 1;
  while (lastTextIndex >= 0 && /^[;,]$/.test(parts[lastTextIndex])) lastTextIndex -= 1;
  if (lastTextIndex < 0) return selected;
  parts[lastTextIndex] = selected;
  return parts.join("").replace(/\s*$/, "");
}

function isoDate(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function toDatetimeInput(value?: string) {
  if (!value) return "";
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return "";
  return `${match[1]}T${match[2] || "08"}:${match[3] || "00"}`;
}

function currentDatetimeInput() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function readTimelineDate(value: Record<string, unknown> | null | undefined, key: string) {
  const raw = value?.[key];
  return typeof raw === "string" ? raw : undefined;
}

const PARTICIPANT_GROUPS = [
  { title: "Issue Initiation", roles: ["requester", "abaper"] },
  { title: "DEV Phase", roles: ["dev_tester", "dev_evaluator"] },
  { title: "QA Phase", roles: ["qa_transporter", "qa_tester", "qa_evaluator"] },
  { title: "PRD Phase", roles: ["prd_requester", "prd_evaluator", "approval", "executor"] }
] as const;

type IssueTimelineEvent = {
  source: string;
  label: string;
  date?: string;
  time?: string;
  order: number;
};

function formatParticipantRole(value: string) {
  const labels: Record<string, string> = {
    requester: "Requester",
    abaper: "ABAPer",
    dev_tester: "DEV Tester",
    dev_evaluator: "DEV Evaluator",
    qa_transporter: "QA Transporter",
    qa_tester: "QA Tester",
    qa_evaluator: "QA Evaluator",
    prd_requester: "PRD Requester",
    prd_evaluator: "PRD Evaluator",
    approval: "Approval",
    executor: "PRD Transporter"
  };
  return labels[value] || value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function participantGroups(participants: IssueDetail["participants"]) {
  const rank = new Map<string, number>();
  PARTICIPANT_GROUPS.forEach((group) => group.roles.forEach((role, index) => rank.set(role, index)));
  return PARTICIPANT_GROUPS.map((group) => ({
    title: group.title,
    roles: [...group.roles],
    participants: participants
      .filter((participant) => (group.roles as readonly string[]).includes(participant.role))
      .sort((left, right) => (rank.get(left.role) || 0) - (rank.get(right.role) || 0) || Number(right.is_primary) - Number(left.is_primary))
  }));
}

function missingIssueData(detail: IssueDetail) {
  const missing: string[] = [];
  const issue = detail.issue;
  if (!issue) return ["Issue header"];
  if (!issue.issue_name) missing.push("Issue name");
  if (!issue.requester_name_snapshot) missing.push("Requester");
  if (!issue.abaper_name_snapshot) missing.push("ABAPer");
  if (!issue.create_issue_date) missing.push("Created date");
  if (!detail.glpi.length) missing.push("GLPI ticket");
  if (!detail.crLinks.length) missing.push("CR link");

  for (const group of PARTICIPANT_GROUPS) {
    for (const role of group.roles) {
      if (!detail.participants.some((participant) => participant.role === role)) missing.push(`Participant: ${formatParticipantRole(role)}`);
    }
  }

  const timelineChecks: Array<[string, string | undefined]> = [
    ["Timeline: DEV Tested", readTimelineDate(detail.devTimeline, "dev_tested_date")],
    ["Timeline: DEV Evaluated", readTimelineDate(detail.devTimeline, "dev_evaluated_date")],
    ["Timeline: QA Tested", readTimelineDate(detail.qaTimeline, "qa_tested_date")],
    ["Timeline: QA Evaluated", readTimelineDate(detail.qaTimeline, "qa_evaluated_date")],
    ["Timeline: PRD Requested", readTimelineDate(detail.prdTimeline, "prd_requested_date")],
    ["Timeline: PRD Evaluated", readTimelineDate(detail.prdTimeline, "prd_evaluated_date")],
    ["Timeline: Approval", readTimelineDate(detail.prdTimeline, "approval_date")]
  ];
  for (const [label, value] of timelineChecks) {
    if (!value) missing.push(label);
  }
  return missing;
}

function issueTimelineEvents(detail: IssueDetail | null) {
  const primaryCr = detail?.crLinks.find((link) => link.is_primary) || detail?.crLinks[0];
  if (detail?.issue?.issue_status === "cancelled") {
    const cancelDate = detail.issue.cancelled_date || latestActivityDate(detail) || detail.issue.create_issue_date;
    const lastActivity = latestActivityBefore(detail, cancelDate, ["Issue Created", "Issue Cancelled"]);
    const events: IssueTimelineEvent[] = [
      { source: "Issue", label: "Issue Created", date: detail.issue.create_issue_date, order: 2 }
    ];
    if (lastActivity?.date && lastActivity.date !== detail.issue.create_issue_date && lastActivity.date !== cancelDate) {
      events.push(lastActivity);
    }
    events.push({ source: "Issue", label: "Issue Cancelled", date: cancelDate, order: 99 });
    return events;
  }
  return [
    { source: "CR", label: "CR Created", date: timelineDate(primaryCr?.sap_created_at), time: timelineClock(primaryCr?.sap_created_at), order: 1 },
    { source: "Issue", label: "Issue Created", date: detail?.issue?.create_issue_date, order: 2 },
    { source: "Issue", label: "DEV Tested", date: readTimelineDate(detail?.devTimeline, "dev_tested_date"), order: 3 },
    { source: "Issue", label: "DEV Evaluated", date: readTimelineDate(detail?.devTimeline, "dev_evaluated_date"), order: 4 },
    { source: "CR", label: "CR Released", date: timelineDate(primaryCr?.sap_released_at), time: timelineClock(primaryCr?.sap_released_at), order: 5 },
    { source: "CR", label: "In QA", date: primaryCr?.qa_import_date, time: primaryCr?.qa_import_time, order: 6 },
    { source: "Issue", label: "QA Tested", date: readTimelineDate(detail?.qaTimeline, "qa_tested_date"), order: 7 },
    { source: "Issue", label: "QA Evaluated", date: readTimelineDate(detail?.qaTimeline, "qa_evaluated_date"), order: 8 },
    { source: "Issue", label: "PRD Requested", date: readTimelineDate(detail?.prdTimeline, "prd_requested_date"), order: 9 },
    { source: "Issue", label: "PRD Evaluated", date: readTimelineDate(detail?.prdTimeline, "prd_evaluated_date"), order: 10 },
    { source: "Issue", label: "Approval", date: readTimelineDate(detail?.prdTimeline, "approval_date"), order: 11 },
    { source: "CR", label: "In PRD", date: primaryCr?.prd_import_date, time: primaryCr?.prd_import_time, order: 12 }
  ];
}

function latestActivityDate(detail: IssueDetail) {
  return latestDatedEvent(allIssueActivityEvents(detail))?.date;
}

function latestActivityBefore(detail: IssueDetail, maxDate?: string, excludeLabels: string[] = []) {
  const maxTime = maxDate ? new Date(maxDate).getTime() : Number.POSITIVE_INFINITY;
  return latestDatedEvent(allIssueActivityEvents(detail).filter((event) => {
    if (!event.date || excludeLabels.includes(event.label)) return false;
    return new Date(event.date).getTime() <= maxTime;
  }));
}

function latestDatedEvent(events: IssueTimelineEvent[]) {
  return events
    .filter((event) => event.date)
    .sort((left, right) => timelineTime(right) - timelineTime(left) || right.order - left.order)[0];
}

function allIssueActivityEvents(detail: IssueDetail) {
  const primaryCr = detail.crLinks.find((link) => link.is_primary) || detail.crLinks[0];
  return [
    { source: "CR", label: "CR Created", date: timelineDate(primaryCr?.sap_created_at), time: timelineClock(primaryCr?.sap_created_at), order: 1 },
    { source: "Issue", label: "Issue Created", date: detail.issue?.create_issue_date, order: 2 },
    { source: "Issue", label: "DEV Tested", date: readTimelineDate(detail.devTimeline, "dev_tested_date"), order: 3 },
    { source: "Issue", label: "DEV Evaluated", date: readTimelineDate(detail.devTimeline, "dev_evaluated_date"), order: 4 },
    { source: "CR", label: "CR Released", date: timelineDate(primaryCr?.sap_released_at), time: timelineClock(primaryCr?.sap_released_at), order: 5 },
    { source: "CR", label: "In QA", date: primaryCr?.qa_import_date, time: primaryCr?.qa_import_time, order: 6 },
    { source: "Issue", label: "QA Tested", date: readTimelineDate(detail.qaTimeline, "qa_tested_date"), order: 7 },
    { source: "Issue", label: "QA Evaluated", date: readTimelineDate(detail.qaTimeline, "qa_evaluated_date"), order: 8 },
    { source: "Issue", label: "PRD Requested", date: readTimelineDate(detail.prdTimeline, "prd_requested_date"), order: 9 },
    { source: "Issue", label: "PRD Evaluated", date: readTimelineDate(detail.prdTimeline, "prd_evaluated_date"), order: 10 },
    { source: "Issue", label: "Approval", date: readTimelineDate(detail.prdTimeline, "approval_date"), order: 11 },
    { source: "CR", label: "In PRD", date: primaryCr?.prd_import_date, time: primaryCr?.prd_import_time, order: 12 },
    { source: "Issue", label: "Issue Cancelled", date: detail.issue?.cancelled_date, order: 99 }
  ];
}

function sortTimelineEvents(events: IssueTimelineEvent[]) {
  return [...events].sort((left, right) => {
    const leftHasDate = Boolean(left.date);
    const rightHasDate = Boolean(right.date);
    if (leftHasDate !== rightHasDate) return leftHasDate ? -1 : 1;
    return timelineTime(left) - timelineTime(right) || left.order - right.order;
  });
}

function timelineTime(event: IssueTimelineEvent) {
  if (!event.date) return Number.POSITIVE_INFINITY;
  return parseAppTimestamp(event.date, event.time)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function normalizeTimelineTime(value?: string) {
  if (!value) return "00:00:00";
  const match = value.match(/^(\d{2}):?(\d{2})?:?(\d{2})?/);
  if (!match) return "00:00:00";
  return `${match[1] || "00"}:${match[2] || "00"}:${match[3] || "00"}`;
}

function timelineDate(value?: string) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = parseAppTimestamp(value);
  if (!date) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timelineClock(value?: string) {
  if (!value || !/[T ]/.test(value)) return undefined;
  const date = parseAppTimestamp(value);
  if (!date) return undefined;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}

function parseAppTimestamp(value?: string, fallbackTime?: string) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  let candidate = raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    candidate = `${raw}T${normalizeTimelineTime(fallbackTime)}`;
  } else if (/^\d{4}-\d{2}-\d{2}\s/.test(raw)) {
    candidate = raw.replace(" ", "T");
  }
  candidate = candidate.replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveMonthPeriod(fromPeriod: string, toPeriod: string) {
  return {
    fromDate: `${fromPeriod}-01`,
    toDate: endOfMonth(`${toPeriod}-01`)
  };
}

function endOfMonth(monthStart: string) {
  const { year, month } = parseMonthValue(monthStart.slice(0, 7));
  const date = new Date(year, month, 0);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month: Number.isFinite(month) ? month : 1
  };
}

function periodRangeLabel(filters: { fromPeriod: string; toPeriod: string }) {
  return `${formatMonthValue(filters.fromPeriod)} - ${formatMonthValue(filters.toPeriod)}`;
}

function periodLabel(period?: { fromDate?: string; toDate?: string; periodType?: string }) {
  if (!period?.fromDate || !period?.toDate) return "-";
  return `${formatDate(period.fromDate)} - ${formatDate(period.toDate)}`;
}

function syncModeLabel(mode?: string, lookbackDays?: number | null) {
  if (mode === "incremental") return `Incremental${lookbackDays !== null && lookbackDays !== undefined ? `, ${lookbackDays} day lookback` : ""}`;
  if (mode === "full_period") return "Full by period";
  return mode || "Sync";
}

function formatMonthValue(value: string) {
  const { year, month } = parseMonthValue(value);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function funnelWidth(value: number, max: number) {
  if (!max) return 0;
  return Math.max(6, Math.round((value / max) * 100));
}

function dropOffText(current: number, next: number) {
  const gap = Math.max(current - next, 0);
  return `${gap} pending next step`;
}
