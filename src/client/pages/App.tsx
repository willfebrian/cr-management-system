import { applyCustomStatusColors } from "../utils/tagColors";
import { applyCustomFontSize } from "../utils/fontSize";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Ban, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Database, FileOutput, FileSearch, FolderKanban, KeyRound, Loader2, LogIn, LogOut, Mail, Moon, MoreVertical, PencilLine, Plus, RefreshCw, Save, Search, ShieldCheck, Sliders, Sparkles, Sun, Trash2, Users, X, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cancelIssue as cancelIssueRequest, deleteIssue as deleteIssueRequest, downloadCrTransportTemplate, fetchAdminSettings, fetchCrDetail, fetchCrList, fetchDashboard, fetchGlpiTicketDetail, fetchIssueDetail, fetchIssueList, fetchIssueTemplate, fetchNextIssueNumber, fetchNextSubIssueNumber, fetchStatusTrend, fetchSystems, fetchValueHelp, registerIssuePeople, saveIssue, syncCr, validateIssuePeople, fetchCurrentUser, login, logout, changePassword, searchOutlookEmail, generateAnalysis, type OutlookSearchEmailResult, type AuthUser, type CrFilters, type IssueFilters, type IssuePersonCheck, type IssuePersonRegistration, type IssueSavePayload, type SyncCrOptions, type SyncCrResult, type ValueHelpKind, type GlpiTicketDetail } from "../api";
import { IncompleteGroupCards } from "../components/IncompleteGroupCards";
import { DisplayNameList } from "../components/DisplayNameList";
import { DEFAULT_ISSUE_COLUMNS, IssueColumnMenu, type IssueColumnKey } from "../components/IssueColumnMenu";
import { SummaryStrip } from "../components/SummaryStrip";
import { ProjectEditor } from "../components/projects/ProjectEditor";
import { ProjectReport } from "../components/projects/ProjectReport";
import { UserManagementWorkspace } from "../components/users/UserManagementWorkspace";
import { MasterDataWorkspace } from "./MasterDataWorkspace";
import { AuditLogReport } from "./AuditLogReport";
import { UIModal, type ModalType } from "../components/common/UIModal";
import { fetchProjectDetail } from "../api/projectApi";
import { afterIncompleteSectionRender, expandSection, getIncompleteItems, groupIncompleteItems, markIncompleteTarget, type ExpandedIssueSections, type IncompleteItem, type IssueSection } from "../issueIncomplete";
import { nextExpandedSidebarGroup, type SidebarGroup } from "../navigation";
import type { CrDetail, CrRequest, DashboardData, IssueDetail, IssueRow, SapSystemConfig, StatusTrendData } from "../../shared/types";
import type { ProjectDetail as ProjectDetailModel } from "../../shared/projectTypes";

type View = "dashboard" | "report" | "issue-display" | "issue-create" | "issue-change" | "user-management" | "project-report" | "project-create" | "project-change" | "master-data" | "settings" | "audit-log";
const VIEW_META: Record<View, { title: string; description: string }> = {
  dashboard: { title: "Dashboard", description: "Monitor CR and Issue activity across connected source systems." },
  report: { title: "CR Transport", description: "Review SAP change requests ordered from the latest CR number." },
  "issue-display": { title: "Issue Report", description: "Search Issues and inspect their linked CR transports." },
  "issue-create": { title: "Create Issue", description: "Register a new Issue and its delivery information." },
  "issue-change": { title: "Change Issue", description: "Maintain Issue details, lifecycle, and linked CR transports." },
  "user-management": { title: "User Management", description: "Create accounts and manage application access." },
  "project-report": { title: "Project Report", description: "Group related Issues and CR transports in one delivery view." },
  "project-create": { title: "Create Project", description: "Create a project and group its related Issues." },
  "project-change": { title: "Change Project", description: "Maintain project ownership, scope, and linked Issues." },
  "master-data": { title: "Master Data Workspace", description: "Manage people roles, emails, and group notifications." },
  settings: { title: "System & Appearance Settings", description: "Configure AI instructions, Exchange Mail, Appearance Settings, Font Size, and Status Tag Colors." },
  "audit-log": { title: "Audit Log & Activity Report", description: "Audit trail report recording system and user activities." },
};
const SYNC_RESULT_VISIBLE_MS = 6000;
const DASHBOARD_DB_REFRESH_MS = 60000;
const REPORT_DB_REFRESH_MS = 120000;
const PROJECTS_ENABLED = import.meta.env.VITE_ENABLE_PROJECTS !== "false";
const USER_MANAGEMENT_ENABLED = import.meta.env.VITE_ENABLE_USER_MANAGEMENT !== "false";

function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onLogin((await login(username, password)).user); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  return <div className="auth-screen"><form className="auth-panel" onSubmit={submit}><div className="brand"><Database size={22} /><span>CR Management System</span></div><h1>Sign in</h1><label>Username<input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter username" autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" autoComplete="current-password" /></label>{error ? <div className="auth-error">{error}</div> : null}<button className="primary-button" disabled={busy}><LogIn size={17} /> {busy ? "Signing in..." : "Sign in"}</button></form></div>;
}

function ChangePasswordScreen({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("admin");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await changePassword(currentPassword, newPassword); onDone(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  return <div className="auth-screen"><form className="auth-panel" onSubmit={submit}><div className="brand"><Database size={22} /><span>CR Management System</span></div><h1>Change password</h1><p>For security, change the initial password before continuing.</p><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input autoFocus type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} /></label>{error ? <div className="auth-error">{error}</div> : null}<button className="primary-button" disabled={busy}><KeyRound size={17} /> {busy ? "Saving..." : "Save password"}</button></form></div>;
}

export function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => { fetchCurrentUser().then((result) => setAuthUser(result.user)).catch(() => setAuthUser(null)).finally(() => setAuthLoading(false)); }, []);

  // Automatically load and apply appearance settings (font size & tag colors) on startup, login, and page refresh.
  // Wait for auth to settle first — otherwise this fires once with username=undefined (before
  // fetchCurrentUser resolves) and again with the real username, and the two async fetchAdminSettings
  // calls race each other, applying mismatched font sizes out of order and causing visible jumps.
  useEffect(() => {
    if (authLoading) return;
    const username = authUser?.username;
    if (username) {
      localStorage.setItem("last_auth_username", username);
    }
    applyCustomFontSize({}, username);
    applyCustomStatusColors({}, username);

    fetchAdminSettings()
      .then((dbSettings) => {
        // Cache the system settings in local storage so index.html can read them synchronously on next refresh
        // This completely eliminates the layout shift (flicker) on all future page loads!
        localStorage.setItem("system_appearance_settings", JSON.stringify(dbSettings));

        applyCustomFontSize(dbSettings, username, true);
        applyCustomStatusColors(dbSettings, username, true);
      })
      .catch(() => {});
  }, [authLoading, authUser]);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("app_theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const [view, setView] = useState<View>("dashboard");
  const workspaceRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    workspaceRef.current?.scrollTo({ top: 0, left: 0 });
  }, [view]);
  const [projectEditorDetail, setProjectEditorDetail] = useState<ProjectDetailModel | null>(null);
  const [projectFormDirty, setProjectFormDirty] = useState(false);
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
  const [loadingIssueDetail, setLoadingIssueDetail] = useState(false);
  const [changeIssueInitialId, setChangeIssueInitialId] = useState<number | null>(null);
  const [changeIssueInitialAction, setChangeIssueInitialAction] = useState<"" | "cancel" | "delete">("");
  const [changeIssueInitialItem, setChangeIssueInitialItem] = useState<IncompleteItem | null>(null);
  const [expandedSidebarGroup, setExpandedSidebarGroup] = useState<SidebarGroup | null>(null);
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
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<SyncCrResult | null>(null);
  const [runningSyncSystems, setRunningSyncSystems] = useState<string[]>([]);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);
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

  async function loadIssues(nextFilters = issueFilters, options?: { preserveSelection?: boolean }) {
    const requestId = ++issueRequestId.current;
    const issueData = await fetchIssueList(nextFilters);
    if (requestId !== issueRequestId.current) return;
    setIssues(issueData.rows);
    setIssuePagination({ page: issueData.page, pageSize: issueData.pageSize, total: issueData.total, totalPages: issueData.totalPages });
    if (!options?.preserveSelection && !issueData.rows.some((issue) => issue.id === selectedIssueId)) setSelectedIssueId(null);
  }

  async function load(nextFilters = filters) {
    setError("");
    try {
      await Promise.all([loadDashboardData(), loadReport(nextFilters)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    type?: ModalType;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    subtitle: "",
    onConfirm: () => {}
  });

  const [metricModal, setMetricModal] = useState<{
    isOpen: boolean;
    title: string;
    kind: "cr" | "issue";
    filters: CrFilters | IssueFilters;
  }>({
    isOpen: false,
    title: "",
    kind: "cr",
    filters: {}
  });

  const [metricModalData, setMetricModalData] = useState<{
    crs: CrRequest[];
    issues: IssueRow[];
    total: number;
    loading: boolean;
    search: string;
  }>({
    crs: [],
    issues: [],
    total: 0,
    loading: false,
    search: ""
  });

  const openMetricPopup = (title: string, kind: "cr" | "issue", filters: CrFilters | IssueFilters) => {
    setMetricModal({ isOpen: true, title, kind, filters });
    setMetricModalData({ crs: [], issues: [], total: 0, loading: true, search: "" });
    if (kind === "cr") {
      fetchCrList({ ...(filters as CrFilters), pageSize: 100 })
        .then((res) => setMetricModalData({ crs: res.rows, issues: [], total: res.total, loading: false, search: "" }))
        .catch(() => setMetricModalData({ crs: [], issues: [], total: 0, loading: false, search: "" }));
    } else {
      fetchIssueList({ ...(filters as IssueFilters), pageSize: 100 })
        .then((res) => setMetricModalData({ crs: [], issues: res.rows, total: res.total, loading: false, search: "" }))
        .catch(() => setMetricModalData({ crs: [], issues: [], total: 0, loading: false, search: "" }));
    }
  };

  async function runSync() {
    const period = resolveMonthPeriod(syncFromPeriod, syncToPeriod);
    const options = { ...syncOptions, systemCodes: syncSystems, syncMode, lookbackDays, ...period };
    const periodText = syncMode === "incremental"
      ? `incremental with ${lookbackDays} day lookback`
      : `period ${options.fromDate} to ${options.toDate}`;

    setConfirmModal({
      isOpen: true,
      title: "Sync SAP CR Data",
      subtitle: `Sync CR ${syncSystems.join(", ")} (${periodText})? Data will be retrieved from SAP and updated in PostgreSQL cache.`,
      type: "primary",
      confirmText: "Sync Now",
      cancelText: "Cancel",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
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
          await loadIssues(issueFilters);
          if (selected) {
            const key = parseRequestKey(selected);
            await fetchCrDetail(key.trkorr, key.sapSystemCode).then(setDetail);
          }
          if (selectedIssueId) {
            await fetchIssueDetail(selectedIssueId).then(setIssueDetail);
          }
          setSyncRefreshToken((current) => current + 1);
        } catch (err) {
          showToast("error", err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
          setRunningSyncSystems([]);
        }
      }
    });
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

  function openIssueFromTrend(status: string, monthStart: string) {
    if (!navigateTo("issue-display")) return;
    const fromDate = monthStart;
    const toDate = endOfMonth(monthStart);
    const nextFilters = { ...issueFilters, status, fromDate, toDate, page: 1, pageSize: issuePagination.pageSize };
    setIssueFilters(nextFilters);
    setDraftIssueFilters(nextFilters);
    loadIssues(nextFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
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

  function openIssueFromCrLink(link: { issue_id?: number | null }) {
    if (!link.issue_id) return;
    const issueId = Number(link.issue_id);
    if (!navigateTo("issue-display")) return;
    setExpandedSidebarGroup("issue");
    setSelectedIssueId(issueId);
    fetchIssueDetail(issueId).then(setIssueDetail).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    loadIssues(issueFilters, { preserveSelection: true }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  async function openIssueFromProjectLink(issueId: number) {
    if (!navigateTo("issue-display")) return;
    setExpandedSidebarGroup("issue");
    setSelectedIssueId(issueId);
    try {
      await Promise.all([
        fetchIssueDetail(issueId).then(setIssueDetail),
        loadIssues(issueFilters, { preserveSelection: true })
      ]);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : String(err));
    }
  }

  function openIncompleteIssueFromProject(issueId: number, item: IncompleteItem) {
    if (!navigateTo("issue-change")) return;
    setExpandedSidebarGroup("issue");
    setChangeIssueInitialId(issueId);
    setChangeIssueInitialAction("");
    setChangeIssueInitialItem(item);
  }

  async function openProjectEditor(projectId: number) {
    setError("");
    try {
      const project = await fetchProjectDetail(projectId);
      setProjectEditorDetail(project);
      setProjectFormDirty(false);
      setView("project-change");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function navigateTo(nextView: View) {
    if (nextView === view) return true;
    if ((view === "issue-create" || view === "issue-change") && issueFormDirty) {
      setConfirmModal({
        isOpen: true,
        title: "Unsaved Changes",
        subtitle: "Unsaved Issue changes will be lost. Do you want to proceed?",
        type: "warning",
        confirmText: "Proceed",
        cancelText: "Keep Editing",
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setIssueFormDirty(false);
          setProjectFormDirty(false);
          setView(nextView);
        }
      });
      return false;
    }
    if ((view === "project-create" || view === "project-change") && projectFormDirty) {
      setConfirmModal({
        isOpen: true,
        title: "Unsaved Changes",
        subtitle: "Unsaved Project changes will be lost. Do you want to proceed?",
        type: "warning",
        confirmText: "Proceed",
        cancelText: "Keep Editing",
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setIssueFormDirty(false);
          setProjectFormDirty(false);
          setView(nextView);
        }
      });
      return false;
    }
    setIssueFormDirty(false);
    setProjectFormDirty(false);
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
      setLoadingDetail(false);
      return;
    }
    setDetail(null);
    setLoadingDetail(true);
    const key = parseRequestKey(selected);
    fetchCrDetail(key.trkorr, key.sapSystemCode)
      .then((res) => {
        setDetail(res);
        setLoadingDetail(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoadingDetail(false);
      });
  }, [selected]);

  useEffect(() => {
    if (!selectedIssueId) {
      setIssueDetail(null);
      setLoadingIssueDetail(false);
      return;
    }
    setIssueDetail(null);
    setLoadingIssueDetail(true);
    fetchIssueDetail(selectedIssueId)
      .then((res) => {
        setIssueDetail(res);
        setLoadingIssueDetail(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoadingIssueDetail(false);
      });
  }, [selectedIssueId]);

  const selectedRequest = useMemo(() => requests.find((request) => requestKey(request) === selected), [requests, selected]);

  if (authLoading) return <div className="auth-screen"><div className="auth-panel"><h1>CR Management System</h1><p>Loading...</p></div></div>;
  if (!authUser) return <LoginScreen onLogin={(user) => { setAuthUser(user); window.location.reload(); }} />;
  if (authUser.mustChangePassword) return <ChangePasswordScreen onDone={() => window.location.reload()} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={22} />
          <span>CR Management System</span>
        </div>
        <div className="sidebar-nav">
        <button className={view === "dashboard" ? "active" : ""} onClick={() => navigateTo("dashboard")}>
          <BarChart3 size={18} /> Dashboard
        </button>
        <button className={view === "report" ? "active" : ""} onClick={() => navigateTo("report")}>
          <FileSearch size={18} /> CR Transport
        </button>
        <div className={`sidebar-group ${view.startsWith("issue-") ? "active" : ""}`}>
          <button className={view.startsWith("issue-") ? "active" : ""} onClick={() => {
            setExpandedSidebarGroup((current) => nextExpandedSidebarGroup(current, "issue"));
          }}>
            <ClipboardList size={18} /> Issue
          </button>
          {expandedSidebarGroup === "issue" ? (
            <div className="sidebar-submenu">
              <button className={view === "issue-display" ? "active" : ""} onClick={() => {
                setChangeIssueInitialId(null);
                setChangeIssueInitialAction("");
                setChangeIssueInitialItem(null);
                if (!navigateTo("issue-display")) return;
                loadIssues(issueFilters).catch((err) => setError(err instanceof Error ? err.message : String(err)));
              }}>
                <FileSearch size={15} /> Report
              </button>
              <button className={view === "issue-create" ? "active" : ""} onClick={() => {
                setChangeIssueInitialId(null);
                setChangeIssueInitialAction("");
                setChangeIssueInitialItem(null);
                navigateTo("issue-create");
              }}><Plus size={15} /> Create</button>
              <button className={view === "issue-change" ? "active" : ""} onClick={() => {
                setChangeIssueInitialId(null);
                setChangeIssueInitialAction("");
                setChangeIssueInitialItem(null);
                navigateTo("issue-change");
              }}><PencilLine size={15} /> Change</button>
            </div>
          ) : null}
        </div>
        {PROJECTS_ENABLED ? <div className={`sidebar-group ${view.startsWith("project-") ? "active" : ""}`}>
          <button className={view.startsWith("project-") ? "active" : ""} onClick={() => setExpandedSidebarGroup((current) => nextExpandedSidebarGroup(current, "project"))}>
            <FolderKanban size={18} /> Project
          </button>
          {expandedSidebarGroup === "project" ? (
            <div className="sidebar-submenu">
              <button className={view === "project-report" ? "active" : ""} onClick={() => navigateTo("project-report")}><FileSearch size={15} /> Report</button>
              <button className={view === "project-create" ? "active" : ""} onClick={() => {
                setProjectEditorDetail(null);
                navigateTo("project-create");
              }}><Plus size={15} /> Create</button>
              <button className={view === "project-change" ? "active" : ""} onClick={() => {
                setProjectEditorDetail(null);
                navigateTo("project-change");
              }}><PencilLine size={15} /> Change</button>
            </div>
          ) : null}
        </div> : null}
        {authUser.role === "ADMIN" ? (
          <div className={`sidebar-group ${view === "master-data" ? "active" : ""}`}>
            <button className={view === "master-data" ? "active" : ""} onClick={() => navigateTo("master-data")}>
              <Database size={18} /> Master Data
            </button>
          </div>
        ) : null}
        <div className={`sidebar-group ${view === "settings" ? "active" : ""}`}>
          <button className={view === "settings" ? "active" : ""} onClick={() => navigateTo("settings")}>
            <Sliders size={18} /> Settings
          </button>
        </div>
        <div className={`sidebar-group ${view === "audit-log" ? "active" : ""}`}>
          <button className={view === "audit-log" ? "active" : ""} onClick={() => navigateTo("audit-log")}>
            <ShieldCheck size={18} /> Audit Log
          </button>
        </div>
        {USER_MANAGEMENT_ENABLED && authUser.role === "ADMIN" ? (
          <button className={view === "user-management" ? "active" : ""} onClick={() => navigateTo("user-management")}>
            <Users size={18} /> User Management
          </button>
        ) : null}
        </div>
        <div className="sidebar-footer">
          <button className="sidebar-theme-toggle" type="button" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} color="#fbbf24" /> : <Moon size={16} color="#cbd5e1" />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <div className="sidebar-session">
            <span className="sidebar-user">{authUser.username}</span>
            <small>Last login: {authUser.lastLoginAt ? formatDateTime(authUser.lastLoginAt) : "First session"}</small>
          </div>
          <button className="logout-button" onClick={() => { logout().finally(() => window.location.reload()); }}><LogOut size={16} /> Logout</button>
        </div>
      </aside>

      <section className="workspace" ref={workspaceRef}>
        <header className="topbar report-topbar">
          <div className="page-identity">
            <h1>{VIEW_META[view].title}</h1>
            <p className="page-description">{VIEW_META[view].description}</p>
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
          <div className={`sync-controls report-sync-controls page-sync-toolbar ${syncMode === "full_period" ? "full-mode" : "incremental-mode"}`}>
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

        {view === "user-management" ? <UserManagementWorkspace
          currentUser={authUser}
          onSessionInvalidated={() => {
            setAuthUser(null);
            setView("dashboard");
          }}
        /> : view === "master-data" ? (
          <MasterDataWorkspace mode="master-data" isAdmin={authUser.role === "ADMIN"} username={authUser.username} />
        ) : view === "settings" ? (
          <MasterDataWorkspace mode="settings" isAdmin={authUser.role === "ADMIN"} username={authUser.username} />
        ) : view === "audit-log" ? (
          <AuditLogReport />
        ) : view === "dashboard" ? (
          <Dashboard
            dashboard={dashboard}
            requests={requests}
            trend={trend}
            trendFilters={trendFilters}
            onTrendFilters={setTrendFilters}
            onApplyTrend={() => load()}
            onTrendClick={openReportFromTrend}
            onIssueTrendClick={openIssueFromTrend}
            onMetricClick={openMetricPopup}
            onNavigateView={(v) => setView(v)}
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
            loadingDetail={loadingDetail}
            onOpenIssue={openIssueFromCrLink}
          />
        ) : view === "issue-display" ? (
          <IssueDisplay
            issues={issues}
            filters={draftIssueFilters}
            pagination={issuePagination}
            selectedId={selectedIssueId}
            detail={issueDetail}
            loadingDetail={loadingIssueDetail}
            onFilters={setDraftIssueFilters}
            onSelect={setSelectedIssueId}
            onCloseDetail={() => setSelectedIssueId(null)}
            onChangeIssue={(issueId) => {
              setChangeIssueInitialId(issueId);
              setChangeIssueInitialAction("");
              setChangeIssueInitialItem(null);
              navigateTo("issue-change");
            }}
            onIssueAction={(issueId, action) => {
              setChangeIssueInitialId(issueId);
              setChangeIssueInitialAction(action);
              setChangeIssueInitialItem(null);
              navigateTo("issue-change");
            }}
            onGenerateCrForm={async (issueId) => {
              setError("");
              try {
                await downloadCrTransportTemplate(issueId);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
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
            onNotify={showToast}
            onDirtyChange={setIssueFormDirty}
            onSave={async (payload) => {
              setError("");
              try {
                const saved = await saveIssue(payload);
                setIssueDetail(saved);
                setSelectedIssueId(saved.issue?.id || null);
                setChangeIssueInitialId(saved.issue?.id || null);
                setChangeIssueInitialAction("");
                setIssueFormDirty(false);
                setSyncRefreshToken((current) => current + 1);
                showToast("success", "Issue saved.");
                setView("issue-change");
                await loadIssues({ ...issueFilters, page: 1 });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        ) : view === "project-report" ? (
          <ProjectReport
            userRole={authUser.role}
            onCreate={() => {
              setProjectEditorDetail(null);
              navigateTo("project-create");
            }}
            onChange={openProjectEditor}
            onOpenIssue={openIssueFromProjectLink}
            onOpenIncompleteItem={openIncompleteIssueFromProject}
            onDeleted={() => {
              showToast("success", "Project deleted.");
              setProjectEditorDetail(null);
              setView("project-report");
            }}
          />
        ) : view === "project-create" ? (
          <ProjectEditor
            mode="create"
            onDirtyChange={setProjectFormDirty}
            onCancel={() => navigateTo("project-report")}
            onSaved={(saved) => {
              setProjectFormDirty(false);
              setProjectEditorDetail(saved);
              showToast("success", "Project created.");
              setView("project-change");
            }}
          />
        ) : view === "project-change" ? (
          projectEditorDetail ? <ProjectEditor
            mode="change"
            detail={projectEditorDetail}
            onDirtyChange={setProjectFormDirty}
            onCancel={() => navigateTo("project-report")}
            onSaved={(saved) => {
              setProjectFormDirty(false);
              setProjectEditorDetail(saved);
              showToast("success", "Project saved.");
            }}
          /> : <ProjectReport
            userRole={authUser.role}
            onChange={openProjectEditor}
            onOpenIssue={openIssueFromProjectLink}
            onOpenIncompleteItem={openIncompleteIssueFromProject}
            onDeleted={() => {
              showToast("success", "Project deleted.");
              setView("project-report");
            }}
          />
        ) : (
          <ChangeIssue
            initialIssueId={changeIssueInitialId}
            initialAction={changeIssueInitialAction}
            initialIncompleteItem={changeIssueInitialItem}
            refreshToken={syncRefreshToken}
            onNotify={showToast}
            onDirtyChange={setIssueFormDirty}
            onSave={async (payload) => {
              setError("");
              try {
                const saved = await saveIssue(payload);
                setIssueDetail(saved);
                setSelectedIssueId(saved.issue?.id || null);
                setChangeIssueInitialId(saved.issue?.id || null);
                setChangeIssueInitialAction("");
                setIssueFormDirty(false);
                setSyncRefreshToken((current) => current + 1);
                showToast("success", "Issue saved.");
                setView("issue-change");
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
      {metricModal.isOpen && (
        <UIModal
          isOpen={metricModal.isOpen}
          onClose={() => setMetricModal(prev => ({ ...prev, isOpen: false }))}
          title={`${metricModal.title} (${metricModalData.total} Data)`}
          subtitle={`Klik pada salah satu baris untuk membuka detail ${metricModal.kind === "cr" ? "CR Transport" : "Issue"}`}
          type="primary"
          cancelText="Tutup"
          maxWidth="980px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", width: "100%" }}>
            <div style={{ position: "relative", width: "100%" }}>
              <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
              <input
                type="text"
                placeholder="Cari berdasarkan nomor, nama, owner/ABAPer..."
                value={metricModalData.search}
                onChange={(e) => setMetricModalData(prev => ({ ...prev, search: e.target.value }))}
                style={{ padding: "9px 12px 9px 36px", borderRadius: "8px", border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", fontSize: "13px" }}
              />
            </div>

            {metricModalData.loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "50px 0", gap: "10px", color: "#0f766e" }}>
                <Loader2 className="animate-spin" size={22} />
                <span style={{ fontWeight: "600" }}>Memuat daftar data...</span>
              </div>
            ) : metricModal.kind === "cr" ? (
              <div style={{ overflowY: "auto", maxHeight: "420px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table className="report-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid #e2e8f0" }}>
                    <tr>
                      <th style={{ padding: "10px 14px", textAlign: "left", width: "130px" }}>CR NUMBER</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", width: "80px" }}>SYSTEM</th>
                      <th style={{ padding: "10px 14px", textAlign: "left" }}>DESCRIPTION</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", width: "160px" }}>OWNER</th>
                      <th style={{ padding: "10px 14px", textAlign: "center", width: "120px" }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metricModalData.crs || []).length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Tidak ada data ditemukan.</td></tr>
                    ) : (
                      (metricModalData.crs || [])
                        .filter(c => !metricModalData.search || `${c.trkorr} ${c.description} ${c.owner}`.toLowerCase().includes(metricModalData.search.toLowerCase()))
                        .slice(0, 100)
                        .map((c) => (
                          <tr
                            key={`${c.sap_system_code}-${c.trkorr}`}
                            className="popup-table-row"
                            onClick={() => {
                              setMetricModal(prev => ({ ...prev, isOpen: false }));
                              openReportFromCrLink({ trkorr: c.trkorr, sap_system_code: c.sap_system_code });
                            }}
                          >
                            <td style={{ padding: "10px 14px", fontWeight: "700", color: "#0f766e" }}>{c.trkorr}</td>
                            <td style={{ padding: "10px 14px", fontWeight: "600", color: "#475569" }}>{c.sap_system_code}</td>
                            <td style={{ padding: "10px 14px", color: "#1e293b" }}>{c.description}</td>
                            <td style={{ padding: "10px 14px", color: "#475569" }}>{c.owner}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}><Status value={c.status_group} /></td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ overflowY: "auto", maxHeight: "420px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table className="report-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid #e2e8f0" }}>
                    <tr>
                      <th style={{ padding: "10px 14px", textAlign: "left", width: "120px" }}>ISSUE KEY</th>
                      <th style={{ padding: "10px 14px", textAlign: "left" }}>ISSUE NAME</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", width: "160px" }}>ABAPER</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", width: "140px" }}>LINKED CR</th>
                      <th style={{ padding: "10px 14px", textAlign: "center", width: "120px" }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metricModalData.issues || []).length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Tidak ada data ditemukan.</td></tr>
                    ) : (
                      (metricModalData.issues || [])
                        .filter(i => !metricModalData.search || `${i.issue_key} ${i.issue_name} ${i.abaper_name_snapshot}`.toLowerCase().includes(metricModalData.search.toLowerCase()))
                        .slice(0, 100)
                        .map((i) => (
                          <tr
                            key={i.id}
                            className="popup-table-row"
                            onClick={() => {
                              setMetricModal(prev => ({ ...prev, isOpen: false }));
                              setChangeIssueInitialId(i.id);
                              setChangeIssueInitialAction("");
                              setChangeIssueInitialItem(null);
                              navigateTo("issue-change");
                            }}
                          >
                            <td style={{ padding: "10px 14px", fontWeight: "700", color: "#0f766e" }}>{i.issue_key}</td>
                            <td style={{ padding: "10px 14px", color: "#1e293b" }}>{i.issue_name}</td>
                            <td style={{ padding: "10px 14px", color: "#475569" }}>{i.abaper_name_snapshot || "-"}</td>
                            <td style={{ padding: "10px 14px", color: "#475569", fontWeight: "600" }}>{i.primary_cr || "-"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}><Status value={i.issue_status || "open"} /></td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </UIModal>
      )}
      <UIModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        subtitle={confirmModal.subtitle}
        type={confirmModal.type || "warning"}
        confirmText={confirmModal.confirmText || "Ya, Lanjutkan"}
        cancelText={confirmModal.cancelText || "Batal"}
        onConfirm={confirmModal.onConfirm}
      />
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
  onTrendClick,
  onIssueTrendClick,
  onMetricClick,
  onNavigateView
}: {
  dashboard: DashboardData | null;
  requests: CrRequest[];
  trend: StatusTrendData | null;
  trendFilters: { fromPeriod: string; toPeriod: string };
  onTrendFilters: (filters: { fromPeriod: string; toPeriod: string }) => void;
  onApplyTrend: () => void;
  onTrendClick: (status: string, monthStart: string) => void;
  onIssueTrendClick: (status: string, monthStart: string) => void;
  onMetricClick?: (title: string, kind: "cr" | "issue", filters: CrFilters | IssueFilters) => void;
  onNavigateView?: (view: View) => void;
}) {
  const outstanding = dashboard?.byStatus.find((row) => row.status_group === "outstanding")?.count || 0;
  const released = dashboard?.byStatus.find((row) => row.status_group === "released")?.count || 0;
  const issueInsights = dashboard?.issueInsights;
  const leaderInsights = dashboard?.leaderInsights;
  const issueStatusCount = (status: string) => issueInsights?.byStatus.find((row) => row.issue_status === status)?.count || 0;
  const issueLifecycleCount = (status: string) => issueInsights?.byLifecycle.find((row) => row.lifecycle_status === status)?.count || 0;

  const getActivityStyle = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'issue':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'ISSUE' };
      case 'project':
        return { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', label: 'PROJECT' };
      case 'sync':
        return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', label: 'SYNC' };
      case 'auth':
        return { bg: '#fff7ed', color: '#c2410c', border: '#ffedd5', label: 'AUTH' };
      case 'master_data':
        return { bg: '#ccfbf1', color: '#0f766e', border: '#99f6e4', label: 'MASTER DATA' };
      case 'setting':
        return { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1', label: 'SETTING' };
      default:
        return { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb', label: (type || 'SYSTEM').toUpperCase().replace('_', ' ') };
    }
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'Just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      return `${diffDays}d ago`;
    } catch {
      return dateStr;
    }
  };

  const abaperWorkloadData = leaderInsights?.abaperWorkload || [];
  const topRequestersData = leaderInsights?.topRequesters || [];

  const [requesterFilter, setRequesterFilter] = useState<"open" | "done" | "all">("open");

  const filteredRequesters = topRequestersData
    .map((req) => {
      const issueCount = requesterFilter === "open"
        ? (req.open_count ?? req.count ?? 0)
        : requesterFilter === "done"
        ? (req.done_count ?? 0)
        : (req.total_count ?? req.count ?? 0);
      return { name: req.name, count: issueCount };
    })
    .filter((req) => req.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="dashboard-grid">
      {/* ABAP Leader Top Metrics */}
      <h2 className="dashboard-section-title" style={{ gridColumn: "1 / -1", margin: "16px 0 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>SAP Transport & CR Overview</span>
        <div style={{ fontSize: "0.85rem", fontWeight: "normal", background: "var(--color-bg-elevated, #f8fafc)", padding: "4px 12px", borderRadius: "16px", border: "1px solid var(--color-border, #e2e8f0)", display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Avg. Transport Lead Time:</span>
          <strong style={{ color: "#0284c7" }}>{leaderInsights?.avgLeadTimeDays || 2.5} Days</strong>
        </div>
      </h2>

      <div className="summary-metrics-bar">
        <Metric label="Outstanding" value={outstanding} onClick={() => onMetricClick?.("Outstanding CR Transports", "cr", { sapSystemCode: "DEV", status: "outstanding" })} />
        <Metric label="Released" value={released} onClick={() => onMetricClick?.("Released CR Transports", "cr", { sapSystemCode: "DEV", status: "released" })} />
        <Metric label="Aging > 14 Days" value={dashboard?.aging?.older_than_14_days || 0} onClick={() => onMetricClick?.("Aging > 14 Days CR Transports", "cr", { sapSystemCode: "DEV", status: "outstanding", agingDays: 14 })} />
        <Metric label="Pending to QA" value={dashboard?.landscape?.pending_qa || 0} onClick={() => onMetricClick?.("Pending to QA CR Transports", "cr", { sapSystemCode: "DEV", status: "all", lifecycleStatus: "pending_qa" })} />
        <Metric label="Pending to PRD" value={dashboard?.landscape?.pending_prd || 0} onClick={() => onMetricClick?.("Pending to PRD CR Transports", "cr", { sapSystemCode: "DEV", status: "all", lifecycleStatus: "pending_prd" })} />
      </div>
      
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
            <button className="secondary" onClick={onApplyTrend}><Search size={15} /> Apply</button>
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

      {/* ABAPer Leader Workload & Requesters Section */}
      <h2 className="dashboard-section-title" style={{ gridColumn: "1 / -1", margin: "16px 0 4px" }}>ABAP Team & Workload Insights</h2>
      
      <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem" }}>
        {/* ABAPer Active Workload Chart */}
        <section className="panel" style={{ margin: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-heading" style={{ marginBottom: "1rem" }}>
            <div>
              <h2>ABAPer Active Task Load</h2>
              <p>Active issues per developer (Open vs In Progress)</p>
            </div>
          </div>
          <div className="chart-wrap" style={{ flex: 1, display: "flex", alignItems: "center" }}>
            {abaperWorkloadData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={abaperWorkloadData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12, fill: "var(--color-text)" }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="open"
                    stackId="a"
                    fill="#6ee7b7"
                    name="Open"
                    radius={[0, 0, 0, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(data) => {
                      if (data?.payload?.name) {
                        const name = data.payload.name;
                        onMetricClick?.(`Open Issues for ABAPer: ${name}`, "issue", { abaper: name, status: "open" });
                      }
                    }}
                  />
                  <Bar
                    dataKey="in_progress"
                    stackId="a"
                    fill="#0f766e"
                    name="In Progress"
                    radius={[0, 4, 4, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(data) => {
                      if (data?.payload?.name) {
                        const name = data.payload.name;
                        onMetricClick?.(`In Progress Issues for ABAPer: ${name}`, "issue", { abaper: name, status: "in_progress" });
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)", width: "100%" }}>No active ABAPer tasks recorded.</div>
            )}
          </div>
        </section>

        {/* Top Requesters List */}
        <section className="panel" style={{ margin: 0, display: "flex", flexDirection: "column" }}>
          <div className="panel-heading" style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2>Top Requesters / Functional Leads</h2>
              <p>Highest volume issue submission by requester (Click to view issues)</p>
            </div>
            <div style={{ display: "flex", background: "var(--color-bg-subtle, #f1f5f9)", padding: "3px", borderRadius: "8px", fontSize: "0.75rem", border: "1px solid var(--color-border, #e2e8f0)" }}>
              <button
                type="button"
                onClick={() => setRequesterFilter("open")}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: requesterFilter === "open" ? "var(--color-bg-elevated, #ffffff)" : "transparent",
                  color: requesterFilter === "open" ? "var(--color-primary, #2563eb)" : "var(--color-text-muted)",
                  fontWeight: requesterFilter === "open" ? "700" : "500",
                  cursor: "pointer",
                  boxShadow: requesterFilter === "open" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => setRequesterFilter("done")}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: requesterFilter === "done" ? "var(--color-bg-elevated, #ffffff)" : "transparent",
                  color: requesterFilter === "done" ? "var(--color-primary, #2563eb)" : "var(--color-text-muted)",
                  fontWeight: requesterFilter === "done" ? "700" : "500",
                  cursor: "pointer",
                  boxShadow: requesterFilter === "done" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => setRequesterFilter("all")}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: requesterFilter === "all" ? "var(--color-bg-elevated, #ffffff)" : "transparent",
                  color: requesterFilter === "all" ? "var(--color-primary, #2563eb)" : "var(--color-text-muted)",
                  fontWeight: requesterFilter === "all" ? "700" : "500",
                  cursor: "pointer",
                  boxShadow: requesterFilter === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                All
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-around", gap: "0.75rem", padding: "0.25rem 0 0.5rem" }}>
            {filteredRequesters.length > 0 ? (
              filteredRequesters.map((req, idx) => {
                const maxCount = filteredRequesters[0]?.count || 1;
                const percentage = Math.round((req.count / maxCount) * 100);
                const rankBadgeStyle = idx === 0
                  ? { bg: "#fef3c7", color: "#b45309", border: "#fde68a" }
                  : idx === 1
                  ? { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" }
                  : idx === 2
                  ? { bg: "#ffedd5", color: "#c2410c", border: "#fed7aa" }
                  : { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };

                return (
                  <div
                    key={req.name}
                    onClick={() => {
                      onMetricClick?.(
                        `Issues by Requester: ${req.name} (${requesterFilter.toUpperCase()})`,
                        "issue",
                        {
                          requester: req.name,
                          status: requesterFilter === "done" ? "ok" : requesterFilter === "open" ? "active" : "all"
                        }
                      );
                    }}
                    title="Click to view detailed issues"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      cursor: "pointer",
                      padding: "4px 6px",
                      borderRadius: "6px",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.875rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: "700", padding: "2px 7px", borderRadius: "10px", background: rankBadgeStyle.bg, color: rankBadgeStyle.color, border: `1px solid ${rankBadgeStyle.border}` }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontWeight: "600", color: "var(--color-text-heading)" }}>{req.name}</span>
                      </div>
                      <span style={{ fontWeight: "700", color: "#0f766e", fontSize: "0.85rem", background: "#f0fdfa", padding: "2px 10px", borderRadius: "12px", border: "1px solid #99f6e4" }}>
                        {req.count} {req.count === 1 ? "Issue" : "Issues"} &rarr;
                      </span>
                    </div>
                    <div style={{ background: "var(--color-bg-subtle, #f1f5f9)", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${percentage}%`, height: "100%", background: "linear-gradient(90deg, #6ee7b7, #0f766e)", borderRadius: "4px", transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)", margin: "auto" }}>No requester data available for this filter.</div>
            )}
          </div>
        </section>
      </div>

      {/* Issue Overview Section */}
      <h2 className="dashboard-section-title" style={{ gridColumn: "1 / -1", margin: "16px 0 4px" }}>Issue Overview</h2>
      
      {/* Row 1: Issue Completion & Status Metrics */}
      <div className="summary-metrics-bar">
        <Metric label="Complete Issues" value={issueInsights?.completion?.complete || 0} onClick={() => onMetricClick?.("Complete Issues List", "issue", { status: "all", completionStatus: "complete" })} />
        <Metric label="Incomplete Active" value={issueInsights?.completion?.incomplete || 0} onClick={() => onMetricClick?.("Incomplete Active Issues List", "issue", { status: "all", completionStatus: "incomplete" })} />
        <Metric label="Open Issues" value={issueStatusCount("open")} onClick={() => onMetricClick?.("Open Issues List", "issue", { status: "open" })} />
        <Metric label="In Progress Issues" value={issueStatusCount("in_progress")} onClick={() => onMetricClick?.("In Progress Issues List", "issue", { status: "in_progress" })} />
        <Metric label="OK Issues" value={issueStatusCount("ok")} onClick={() => onMetricClick?.("OK Issues List", "issue", { status: "ok" })} />
      </div>

      {/* Row 2: Issue by CR Lifecycle Metrics */}
      <div className="summary-metrics-bar summary-metrics-bar-6">
        <Metric label="No CR Assigned" value={issueLifecycleCount("no_cr")} onClick={() => onMetricClick?.("Issues with No CR Assigned", "issue", { lifecycleStatus: "no_cr" })} />
        <Metric label="CR Created" value={issueLifecycleCount("created")} onClick={() => onMetricClick?.("Issues with CR Created", "issue", { lifecycleStatus: "created" })} />
        <Metric label="CR Released" value={issueLifecycleCount("released")} onClick={() => onMetricClick?.("Issues with CR Released", "issue", { lifecycleStatus: "released" })} />
        <Metric label="CR In QA" value={issueLifecycleCount("in_qa")} onClick={() => onMetricClick?.("Issues with CR In QA", "issue", { lifecycleStatus: "in_qa" })} />
        <Metric label="CR In PRD" value={issueLifecycleCount("in_prd")} onClick={() => onMetricClick?.("Issues with CR In PRD", "issue", { lifecycleStatus: "in_prd" })} />
        <Metric label="Cancelled / Excluded" value={issueLifecycleCount("cancelled")} onClick={() => onMetricClick?.("Cancelled / Excluded Issues List", "issue", { status: "cancelled" })} />
      </div>

      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Issue Status Trend</h2>
            <p>Last 6 months by issue created timestamp</p>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={issueInsights?.trend || []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month_label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="open" fill="#93c5fd" name="Open" radius={[4, 4, 0, 0]} onClick={(data) => onIssueTrendClick("open", data.payload.month_start)} />
              <Bar dataKey="in_progress" fill="#e0a11b" name="In Progress" radius={[4, 4, 0, 0]} onClick={(data) => onIssueTrendClick("in_progress", data.payload.month_start)} />
              <Bar dataKey="ok" fill="#0f766e" name="OK" radius={[4, 4, 0, 0]} onClick={(data) => onIssueTrendClick("ok", data.payload.month_start)} />
              <Bar dataKey="cancelled" fill="#b91c1c" name="Cancelled" radius={[4, 4, 0, 0]} onClick={(data) => onIssueTrendClick("cancelled", data.payload.month_start)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Recent CR Activity Section */}
      <section className="panel wide">
        <h2>Recent CR Activity</h2>
        <div className="rows">
          {(dashboard?.recentActivity || requests.slice(0, 8)).map((request) => (
            <div className="row" key={`${request.sap_system_code}-${request.trkorr}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: "700", fontSize: "0.875rem", whiteSpace: "nowrap" }}>{request.sap_system_code} - {request.trkorr}</span>
                <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{request.description}</small>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
                {request.requester_name ? (
                  <span title="Requester" style={{ background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                    Req: <strong>{request.requester_name}</strong>
                  </span>
                ) : null}
                {request.abaper_name ? (
                  <span title="ABAPer" style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: "12px", border: "1px solid #bfdbfe" }}>
                    ABAP: <strong>{request.abaper_name}</strong>
                  </span>
                ) : null}
                {request.tester_name ? (
                  <span title="Tester" style={{ background: "#f0fdf4", color: "#15803d", padding: "2px 8px", borderRadius: "12px", border: "1px solid #bbf7d0" }}>
                    Test: <strong>{request.tester_name}</strong>
                  </span>
                ) : null}
                {(request.requester_name || request.abaper_name || request.tester_name) ? (
                  <div style={{ width: "1px", height: "16px", background: "var(--color-border, #cbd5e1)", margin: "0 4px" }} />
                ) : null}
                <Status value={request.status_group} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Enhanced Recent Team Activity Stream Section */}
      <section className="panel wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Recent Team Activity Stream</h2>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Live audit log stream of recent team actions and SAP sync events</p>
          </div>
          {onNavigateView && (
            <button
              onClick={() => onNavigateView("audit-log")}
              style={{ background: "none", border: "none", color: "var(--color-primary, #2563eb)", cursor: "pointer", fontWeight: "600", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "4px" }}
            >
              View Full Audit Log &rarr;
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {leaderInsights?.recentLogs && leaderInsights.recentLogs.length > 0 ? (
            leaderInsights.recentLogs.map((log) => {
              const badge = getActivityStyle(log.activity_type);
              return (
                <div
                  key={log.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    background: "var(--color-bg-subtle, #f8fafc)",
                    border: "1px solid var(--color-border, #e2e8f0)",
                    gap: "1rem"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        minWidth: "115px",
                        width: "115px",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "0.7rem",
                        fontWeight: "700",
                        letterSpacing: "0.5px",
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center"
                      }}
                    >
                      {badge.label}
                    </span>
                    <span
                      style={{
                        minWidth: "130px",
                        width: "130px",
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        color: "var(--color-text-heading)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}
                    >
                      {log.username || "System"}
                    </span>
                    <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.description}
                    </span>
                  </div>
                  <small style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap", fontWeight: "500" }}>
                    {formatRelativeTime(log.created_at)}
                  </small>
                </div>
              );
            })
          ) : (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted)" }}>No recent audit activity recorded yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <section
      className={`metric ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      title={onClick ? `Klik untuk melihat popup data ${label}` : undefined}
    >
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
  detail,
  loadingDetail,
  onOpenIssue
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
  loadingDetail?: boolean;
  onOpenIssue: (link: { issue_id?: number | null }) => void;
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
      <section className="cr-data-workspace">
      <section className="filterbar report-filterbar cr-workspace-filterbar">
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

      <div className="report-layout detail-closed">
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
            <button className="secondary" onClick={() => onPage(1)} disabled={pagination.page <= 1}><ArrowLeft size={14} /> First</button>
            <button className="secondary" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page <= 1}><ArrowLeft size={14} /> Prev</button>
            <button className="secondary" onClick={() => onPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}><ArrowRight size={14} /> Next</button>
            <button className="secondary" onClick={() => onPage(pagination.totalPages)} disabled={pagination.page >= pagination.totalPages}><ArrowRight size={14} /> Last</button>
          </div>
        </section>
      </div>

      <UIModal
        isOpen={hasDetail}
        onClose={onCloseDetail}
        title={displayRequest?.trkorr || "CR Detail"}
        subtitle={displayRequest?.description}
        type="primary"
        maxWidth="980px"
        hideFooter
      >
        {loadingDetail ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "260px", gap: "14px", color: "var(--color-text-muted)" }}>
            <Loader2 className="animate-spin" size={34} color="#0f766e" />
            <span style={{ fontSize: "0.925rem", fontWeight: "600", color: "#0f766e" }}>Loading CR detail & SAP transport objects...</span>
          </div>
        ) : (
        <div className="cr-modal-content-animated" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* 1. Header Banner & Quick Metadata */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.85rem",
            background: "var(--color-bg-subtle, #f8fafc)",
            padding: "1rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid var(--color-border, #e2e8f0)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--color-text-heading)" }}>
                  {displayRequest?.trkorr}
                </span>
                {displayRequest && (
                  <Status value={displayLifecycleStatusFromDetail(detail, displayRequest.lifecycle_status || displayRequest.status_group)} />
                )}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                <span>Last Changed: <strong>{formatDate(displayRequest?.changed_date)}</strong></span>
              </div>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "0.75rem",
              paddingTop: "0.5rem",
              borderTop: "1px dashed var(--color-border, #cbd5e1)"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "0.725rem", textTransform: "uppercase", fontWeight: "600", color: "var(--color-text-muted)", letterSpacing: "0.03em" }}>Owner</span>
                <strong style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>{displayRequest?.owner || "-"}</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "0.725rem", textTransform: "uppercase", fontWeight: "600", color: "var(--color-text-muted)", letterSpacing: "0.03em" }}>Target System</span>
                <strong style={{ fontSize: "0.875rem", color: "#0f766e" }}>{displayRequest?.target_system || "-"}</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "0.725rem", textTransform: "uppercase", fontWeight: "600", color: "var(--color-text-muted)", letterSpacing: "0.03em" }}>CR Type</span>
                <strong style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>{displayRequest?.function_code || "-"}</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "0.725rem", textTransform: "uppercase", fontWeight: "600", color: "var(--color-text-muted)", letterSpacing: "0.03em" }}>Tasks Count</span>
                <strong style={{ fontSize: "0.875rem", color: "var(--color-text)" }}>{detail?.tasks.length || 0} Tasks</strong>
              </div>
            </div>
          </div>

          {/* 2. Middle Section: Related Issues & Child Tasks + Lifecycle Timeline */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "1.25rem", alignItems: "stretch" }}>
            
            {/* Box A: Linked Issues & Tasks */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              background: "var(--color-bg-elevated, #ffffff)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: "12px",
              padding: "1.1rem"
            }}>
              {/* Linked Issues */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: 0, color: "var(--color-text-heading)" }}>
                    <FolderKanban size={16} color="#0f766e" /> Linked Issues ({detail?.issueLinks.length || 0})
                  </h3>
                </div>
                <div className="rows compact cr-related-issues">
                  {(detail?.issueLinks || []).map((link) => {
                    const issueKey = link.issue_no ? `${link.issue_no}-${link.sub_issue_no || "01"}` : "Issue removed";
                    const status = formatIssueLinkStatus(link.relation_status, link.current_issue_status || link.issue_status_snapshot);
                    return link.issue_id ? (
                      <button className="cr-related-issue-link" type="button" key={link.id} onClick={() => { onCloseDetail(); onOpenIssue(link); }}>
                        <span className="cr-related-issue-copy">
                          <span className="cr-related-issue-heading">
                            <strong>{issueKey}</strong>
                            <Status value={status} />
                          </span>
                          <span className="cr-related-issue-name">{link.issue_name || "-"}</span>
                        </span>
                        <ChevronRight className="cr-related-issue-chevron" size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <div className="cr-related-issue-link historical" key={link.id}>
                        <span className="cr-related-issue-copy">
                          <span className="cr-related-issue-heading">
                            <strong>{issueKey}</strong>
                            <Status value={status} />
                          </span>
                          <span className="cr-related-issue-name">{link.issue_name || "Issue removed"}</span>
                        </span>
                      </div>
                    );
                  })}
                  {detail && detail.issueLinks.length === 0 ? <div className="empty" style={{ padding: "12px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No Issue linked to this CR.</div> : null}
                </div>
              </div>

              {/* Child Tasks */}
              <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--color-border, #f1f5f9)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: 0, color: "var(--color-text-heading)" }}>
                    <ClipboardList size={16} color="#0f766e" /> Child Transport Tasks ({detail?.tasks.length || 0})
                  </h3>
                </div>
                <div className="rows compact">
                  {(detail?.tasks || []).map((task) => (
                    <div className="row task-row" key={task.trkorr} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--color-bg-subtle, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-border, #e2e8f0)", marginBottom: "6px" }}>
                      <strong style={{ fontSize: "0.85rem" }}>{task.trkorr}</strong>
                      <Status value={displayLifecycleStatus(task.lifecycle_status || task.status_group)} />
                    </div>
                  ))}
                  {detail && detail.tasks.length === 0 ? <div className="empty" style={{ padding: "12px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No child tasks cached.</div> : null}
                </div>
              </div>
            </div>

            {/* Box B: Lifecycle Timeline */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--color-bg-elevated, #ffffff)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: "12px",
              padding: "1.1rem"
            }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", marginBottom: "1rem", color: "var(--color-text-heading)" }}>
                <ShieldCheck size={16} color="#0f766e" /> Transport Lifecycle Audit Trail
              </h3>
              <div className="issue-timeline cr-lifecycle-timeline" style={{ flex: 1 }}>
                {[
                  { label: "Created", value: formatIssueTimestamp(detail?.lifecycle.created_at), filled: Boolean(detail?.lifecycle.created_at) },
                  { label: "Released", value: formatIssueTimestamp(detail?.lifecycle.released_at), filled: Boolean(detail?.lifecycle.released_at) },
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
            </div>

          </div>

          {/* 3. Bottom Section: SAP Objects (SE03 Objects) */}
          <div style={{
            background: "var(--color-bg-elevated, #ffffff)",
            border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: "12px",
            padding: "1.1rem"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: 0, color: "var(--color-text-heading)" }}>
                <Database size={16} color="#0f766e" /> SAP Objects Catalog / SE03 ({detail?.objects.length || 0} Objects)
              </h3>
            </div>
            <div className="object-list se03-object-list">
              {groupObjectsBySe03Label(detail?.objects || []).map((group) => (
                <div className="object-group" key={group.key} style={{ marginBottom: "1rem" }}>
                  <div className="object-group-title" style={{ background: "var(--color-bg-subtle, #f1f5f9)", padding: "8px 12px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{group.label}</strong>
                    <code style={{ fontSize: "0.75rem", background: "var(--color-bg-elevated, #ffffff)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--color-border, #cbd5e1)" }}>{group.key}</code>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "8px", marginTop: "8px" }}>
                    {group.objects.map((object) => (
                      <div className="object-row se03-object-row" key={`${object.trkorr}-${object.position}`} style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border, #e2e8f0)", background: "var(--color-bg-elevated, #ffffff)" }}>
                        <code>{object.pgmid} {object.object_type}</code>
                        <div>
                          <strong style={{ fontSize: "0.85rem", wordBreak: "break-word" }}>{object.object_name}</strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{object.trkorr} - {object.position}</span>
                          <small>{labelDiffReadiness(object.diff_readiness)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {detail && detail.objects.length === 0 ? <div className="empty" style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>No objects cached for this CR.</div> : null}
            </div>
          </div>
        </div>
        )}
      </UIModal>
      </section>
    </>
  );
}

function IssueDisplay({
  issues,
  filters,
  pagination,
  selectedId,
  detail,
  loadingDetail,
  onFilters,
  onSelect,
  onCloseDetail,
  onChangeIssue,
  onIssueAction,
  onGenerateCrForm,
  onPage,
  onPageSize,
  onOpenCr
}: {
  issues: IssueRow[];
  filters: IssueFilters;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  selectedId: number | null;
  detail: IssueDetail | null;
  loadingDetail?: boolean;
  onFilters: (filters: IssueFilters) => void;
  onSelect: (value: number) => void;
  onCloseDetail: () => void;
  onChangeIssue: (id: number) => void;
  onIssueAction: (id: number, action: "cancel" | "delete") => void;
  onGenerateCrForm: (id: number) => void;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  onOpenCr: (link: { sap_system_code?: string; trkorr: string }) => void;
}) {
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [visibleIssueColumns, setVisibleIssueColumns] = useState<IssueColumnKey[]>([...DEFAULT_ISSUE_COLUMNS]);
  const selectedIssue = issues.find((issue) => issue.id === selectedId) || detail?.issue || null;
  const hasDetail = Boolean(selectedId && selectedIssue);
  const canGenerateCrForm = Boolean(detail?.crLinks?.length);
  const primaryGlpiTicket = detail?.glpi?.find((ticket) => ticket.is_primary)?.ticket_number
    ?? detail?.glpi?.[0]?.ticket_number
    ?? selectedIssue?.primary_glpi_ticket;
  const detailIncompleteItems = detail?.issue?.issue_status !== "cancelled" && detail ? getIncompleteItems(detail) : [];
  const detailIncompleteGroups = groupIncompleteItems(detailIncompleteItems);
  const issueColumns = useResizableColumns("issue-report-columns", {
    issue: 112,
    name: 280,
    abaper: 160,
    glpi: 110,
    crHelpdesk: 140,
    cr: 132,
    status: 120,
    completeness: 48
  }, {
    issue: 100,
    name: 220,
    abaper: 130,
    glpi: 90,
    crHelpdesk: 115,
    cr: 115,
    status: 115,
    completeness: 44
  });
  const issueTableWidth = visibleIssueColumns.reduce((total, column) => total + issueColumns.widths[column], 0);

  function updateFilter(key: keyof IssueFilters, value: string) {
    onFilters({ ...filters, [key]: value });
  }

  function toggleIssueColumn(column: IssueColumnKey) {
    setVisibleIssueColumns((current) => current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column]);
  }

  function hasIssueColumn(column: IssueColumnKey) {
    return visibleIssueColumns.includes(column);
  }

  return (
    <section className="issue-report-workspace">
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
        <IssueColumnMenu
          open={columnMenuOpen}
          visibleColumns={visibleIssueColumns}
          onOpenChange={setColumnMenuOpen}
          onToggle={toggleIssueColumn}
        />
      </section>

      <div className="report-layout issue-layout controlled-dual-pane detail-closed">
        <section className="table-panel report-table-panel issue-table-panel">
          <div className="table-scroll">
            <table className="record-table issue-record-table" style={{ width: issueTableWidth, minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: issueColumns.widths.issue }} />
                <col style={{ width: issueColumns.widths.name }} />
                <col style={{ width: issueColumns.widths.abaper }} />
                {hasIssueColumn("glpi") ? <col style={{ width: issueColumns.widths.glpi }} /> : null}
                {hasIssueColumn("crHelpdesk") ? <col style={{ width: issueColumns.widths.crHelpdesk }} /> : null}
                <col style={{ width: issueColumns.widths.cr }} />
                <col style={{ width: issueColumns.widths.status }} />
                <col style={{ width: issueColumns.widths.completeness }} />
              </colgroup>
              <thead>
                <tr>
                  <ResizableHeader label="Issue" column="issue" width={issueColumns.widths.issue} onResize={issueColumns.startResize} />
                  <ResizableHeader label="Name" column="name" width={issueColumns.widths.name} onResize={issueColumns.startResize} />
                  <ResizableHeader label="ABAPer" column="abaper" width={issueColumns.widths.abaper} onResize={issueColumns.startResize} />
                  {hasIssueColumn("glpi") ? <ResizableHeader label="GLPI" column="glpi" width={issueColumns.widths.glpi} onResize={issueColumns.startResize} /> : null}
                  {hasIssueColumn("crHelpdesk") ? <ResizableHeader label="CR Helpdesk" column="crHelpdesk" width={issueColumns.widths.crHelpdesk} onResize={issueColumns.startResize} /> : null}
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
                    <td>{issue.abaper_name_snapshot || "-"}</td>
                    {hasIssueColumn("glpi") ? <td>{formatGlpi(issue.primary_glpi_ticket)}</td> : null}
                    {hasIssueColumn("crHelpdesk") ? <td>{issue.primary_cr_helpdesk_no || "-"}</td> : null}
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
            <button className="secondary" onClick={() => onPage(1)} disabled={pagination.page <= 1}><ArrowLeft size={14} /> First</button>
            <button className="secondary" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page <= 1}><ArrowLeft size={14} /> Prev</button>
            <button className="secondary" onClick={() => onPage(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}><ArrowRight size={14} /> Next</button>
            <button className="secondary" onClick={() => onPage(pagination.totalPages)} disabled={pagination.page >= pagination.totalPages}><ArrowRight size={14} /> Last</button>
          </div>
        </section>
      </div>

      <UIModal
        isOpen={hasDetail}
        onClose={onCloseDetail}
        title={selectedIssue?.issue_key || "Issue Detail"}
        subtitle={selectedIssue?.issue_name}
        type="primary"
        maxWidth="980px"
        hideFooter
      >
        {loadingDetail ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "260px", gap: "14px", color: "var(--color-text-muted)" }}>
            <Loader2 className="animate-spin" size={34} color="#0f766e" />
            <span style={{ fontSize: "0.925rem", fontWeight: "600", color: "#0f766e" }}>Loading Issue detail & linked CRs...</span>
          </div>
        ) : (
          <div className="cr-modal-content-animated" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Header Actions & Summary Strip Banner */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              background: "var(--color-bg-subtle, #f8fafc)",
              padding: "1rem 1.25rem",
              borderRadius: "12px",
              border: "1px solid var(--color-border, #e2e8f0)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: "700", color: "var(--color-text-heading)" }}>
                    {selectedIssue?.issue_key}
                  </span>
                  {selectedIssue && <Status value={selectedIssue.issue_status} />}
                </div>

                {/* Actions Dropdown */}
                {selectedIssue && (
                  <div className="detail-action-menu" style={{ position: "relative" }}>
                    <button
                      className="primary"
                      type="button"
                      onClick={() => setDetailMenuOpen((current) => !current)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "0.85rem", background: "#0f766e", color: "#ffffff", borderRadius: "8px", border: "none", cursor: "pointer" }}
                    >
                      <span>Actions</span>
                      <ChevronDown size={15} />
                    </button>
                    {detailMenuOpen && (
                      <div className="detail-action-menu-list" style={{ right: 0, top: "100%", marginTop: "4px" }}>
                        <button type="button" onClick={() => { setDetailMenuOpen(false); onCloseDetail(); onChangeIssue(selectedIssue.id); }}>
                          <PencilLine size={15} /> Change Issue
                        </button>
                        {canGenerateCrForm && (
                          <button type="button" onClick={() => { setDetailMenuOpen(false); onGenerateCrForm(selectedIssue.id); }}>
                            <FileSearch size={15} /> Generate CR Form
                          </button>
                        )}
                        <button type="button" disabled={selectedIssue.issue_status === "cancelled"} onClick={() => { setDetailMenuOpen(false); onIssueAction(selectedIssue.id, "cancel"); }}>
                          <XCircle size={15} /> Cancel Issue
                        </button>
                        <button type="button" className="danger-menu-item" onClick={() => { setDetailMenuOpen(false); onIssueAction(selectedIssue.id, "delete"); }}>
                          <X size={15} /> Delete Issue
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <SummaryStrip items={[
                { label: "Email Subject", value: detail?.issue?.email_subject || "-", wide: true },
                { label: "Requester", value: <DisplayNameList value={selectedIssue?.requester_name_snapshot} /> },
                { label: "ABAPer", value: <DisplayNameList value={selectedIssue?.abaper_name_snapshot} /> },
                { label: "Created", value: formatIssueTimestamp(selectedIssue?.create_issue_date) },
                {
                  label: "GLPI",
                  value: primaryGlpiTicket
                    ? <a className="summary-strip-link" href={glpiUrl(primaryGlpiTicket)} target="_blank" rel="noreferrer">{primaryGlpiTicket}</a>
                    : "-"
                },
                { label: "CR Helpdesk No.", value: formatCrHelpdeskNumbers(detail) || selectedIssue?.primary_cr_helpdesk_no || "-" }
              ]} />
            </div>

            {/* Incomplete Warning if any */}
            {detailIncompleteItems.length ? (
              <section className="issue-missing-box" style={{ margin: 0, borderRadius: "10px" }}>
                <strong>Incomplete items</strong>
                <IncompleteGroupCards groups={detailIncompleteGroups} />
              </section>
            ) : null}

            {detail?.issue?.issue_status === "cancelled" ? (
              <section className="issue-cancel-box" style={{ margin: 0, borderRadius: "10px" }}>
                <strong>Cancel Reason</strong>
                <span>{detail.issue.cancelled_reason || "cancelled"}</span>
              </section>
            ) : null}

            {/* 2-Column Grid Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "1.25rem", alignItems: "start" }}>
              
              {/* Left Column: Analysis, Linked CRs, Participants */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ background: "var(--color-bg-elevated, #ffffff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "12px", padding: "1.1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.85rem 0", color: "var(--color-text-heading)" }}>
                    <Sparkles size={16} color="#0f766e" /> Analysis & Impact
                  </h3>
                  <div className="analysis-block">
                    <span>Problem</span>
                    <p>{detail?.issue?.problem_analysis || "-"}</p>
                    <span>Impact</span>
                    <p>{detail?.issue?.impact_analysis || "-"}</p>
                  </div>
                </div>

                <div style={{ background: "var(--color-bg-elevated, #ffffff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "12px", padding: "1.1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.85rem 0", color: "var(--color-text-heading)" }}>
                    <Database size={16} color="#0f766e" /> Linked CR Transports ({detail?.crLinks.length || 0})
                  </h3>
                  <div className="rows">
                    {(detail?.crLinks || []).map((link) => (
                      <button className="row issue-link-row issue-link-button" type="button" key={link.id} onClick={() => { onCloseDetail(); onOpenCr(link); }}>
                        <span>{link.trkorr}</span>
                        <small>{link.cr_description_snapshot || "-"}</small>
                      </button>
                    ))}
                    {detail && detail.crLinks.length === 0 ? <div className="empty" style={{ padding: "12px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No CR linked.</div> : null}
                  </div>
                </div>

                <div style={{ background: "var(--color-bg-elevated, #ffffff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "12px", padding: "1.1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.85rem 0", color: "var(--color-text-heading)" }}>
                    <Users size={16} color="#0f766e" /> Issue Participants ({detail?.participants.length || 0})
                  </h3>
                  <div className="rows compact-participants">
                    {participantGroups(detail?.participants || []).map((group) => (
                      <section className="participant-phase" key={group.title}>
                        <strong>{group.title}</strong>
                        {group.roles.map((role) => {
                          const matches = group.participants.filter((participant) => participant.role === role);
                          const showTags = matches.length > 1;
                          return matches.length ? matches.map((participant, index) => (
                            <div className="row participant-row" key={participant.id}>
                              <span className="participant-role-title">{formatParticipantRole(role)}</span>
                              <div className="participant-num-cell">
                                {showTags ? (
                                  <span className={`participant-num-badge ${participant.is_primary ? "primary" : "secondary"}`}>
                                    #{index + 1}
                                  </span>
                                ) : null}
                              </div>
                              <small style={{ fontWeight: participant.is_primary ? 600 : 400, color: "var(--color-text)" }}>
                                {participant.full_name || participant.person_name_snapshot}{participant.nickname ? ` (${participant.nickname})` : ""}
                              </small>
                              <small style={{ textAlign: "right", color: "var(--color-text-muted)" }}>
                                {participant.department || "-"}
                              </small>
                            </div>
                          )) : (
                            <div className="row participant-row empty-participant" key={role}>
                              <span className="participant-role-title">{formatParticipantRole(role)}</span>
                              <div className="participant-num-cell" />
                              <small style={{ color: "var(--color-text-muted)" }}>-</small>
                              <small style={{ textAlign: "right", color: "var(--color-text-muted)" }}>-</small>
                            </div>
                          );
                        })}
                      </section>
                    ))}
                    {detail && detail.participants.length === 0 ? <div className="empty" style={{ padding: "12px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No participants cached.</div> : null}
                  </div>
                </div>
              </div>

              {/* Right Column: Timelines */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ background: "var(--color-bg-elevated, #ffffff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "12px", padding: "1.1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.85rem 0", color: "var(--color-text-heading)" }}>
                    <ShieldCheck size={16} color="#0f766e" /> Timeline Issue
                  </h3>
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
                </div>

                <div style={{ background: "var(--color-bg-elevated, #ffffff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "12px", padding: "1.1rem" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.85rem 0", color: "var(--color-text-heading)" }}>
                    <ShieldCheck size={16} color="#0f766e" /> Lifecycle CR Transport
                  </h3>
                  <div className="issue-timeline cr-lifecycle-timeline">
                    {issueCrLifecycleEvents(detail).map((event) => (
                      <div className={`timeline-event ${event.date ? "filled" : "missing"}`} key={`${event.source}-${event.label}`}>
                        <span className="timeline-dot" />
                        <div>
                          <small>{event.date ? formatIssueTimestamp(event.date, event.time) : "-"}</small>
                          <strong>{event.label}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </UIModal>
    </section>
  );
}

function IssueEditor({
  mode,
  detail,
  initialAction = "",
  navigationRequest,
  onNotify,
  onSave,
  onCancel,
  onDelete,
  onDirtyChange
}: {
  mode: "create" | "change";
  detail: IssueDetail | null;
  initialAction?: "" | "cancel" | "delete";
  navigationRequest?: { sequence: number; item: IncompleteItem } | null;
  onNotify?: (type: "success" | "error", message: string) => void;
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
  const [glpiPreview, setGlpiPreview] = useState<Record<string, { title?: string; openedAt?: string; status?: string; notFound?: boolean }>>({});
  const [expandedPhases, setExpandedPhases] = useState<ExpandedIssueSections>({ initiation: true, dev: true, qa: true, prd: true });
  const [fetchingEmail, setFetchingEmail] = useState(false);
  const [fetchedEmailContext, setFetchedEmailContext] = useState<string | null>(null);
  const [fetchingGlpi, setFetchingGlpi] = useState(false);
  const [fetchedGlpiContext, setFetchedGlpiContext] = useState<GlpiTicketDetail | null>(null);
  const fetchedGlpiTicketRef = useRef<number | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [showAiOverwriteModal, setShowAiOverwriteModal] = useState(false);
  const [aiOverwriteSelections, setAiOverwriteSelections] = useState<{
    issueName: boolean;
    problemAnalysis: boolean;
    impactAnalysis: boolean;
  }>({ issueName: true, problemAnalysis: true, impactAnalysis: true });

  async function handleFetchGlpiContent(ticketNoOverride?: number | string) {
    const firstTicket = (form.glpiTickets || "").split(/[,;\s]+/)[0] || "";
    const rawNo = ticketNoOverride ?? firstTicket;
    const ticketNo = Number(String(rawNo || "").replace(/[^\d]/g, ""));
    if (!ticketNo) {
      onNotify?.("error", "Please enter a valid GLPI Ticket Number first.");
      setFetchedGlpiContext(null);
      return;
    }
    setFetchingGlpi(true);
    try {
      const res = await fetchGlpiTicketDetail(ticketNo);
      if (!res.ok || !res.ticket) {
        setFetchedGlpiContext(null);
        onNotify?.("error", `GLPI Ticket #${ticketNo} not found in GLPI database.`);
        return;
      }
      setFetchedGlpiContext(res.ticket);

      // Auto fill issue name if empty
      if (!form.issueName?.trim() && res.ticket.title) {
        update("issueName", res.ticket.title);
      }

      onNotify?.("success", `Fetched GLPI Ticket #${ticketNo} details & context successfully! AI Analysis is enabled.`);
    } catch (err) {
      setFetchedGlpiContext(null);
      const msg = err instanceof Error ? err.message : String(err);
      onNotify?.("error", `Failed to fetch GLPI Ticket #${ticketNo}: ${msg}`);
    } finally {
      setFetchingGlpi(false);
    }
  }

  // Auto-fetch GLPI ticket detail when GLPI number is present or changed
  const primaryGlpiNo = (form.glpiTickets || "").split(/[,;\s]+/)[0] || "";
  useEffect(() => {
    if (primaryGlpiNo) {
      const num = Number(String(primaryGlpiNo).replace(/[^\d]/g, ""));
      if (num && fetchedGlpiTicketRef.current !== num) {
        fetchedGlpiTicketRef.current = num;
        handleFetchGlpiContent(num);
      }
    }
  }, [primaryGlpiNo]);

  async function handleFetchEmailContent() {
    if (!form.emailSubject?.trim()) {
      onNotify?.("error", "Please enter an Email Subject first.");
      setFetchedEmailContext(null);
      return;
    }
    setFetchingEmail(true);
    try {
      const res = await searchOutlookEmail(form.emailSubject);
      if (!res.rows || res.rows.length === 0) {
        setFetchedEmailContext(null);
        onNotify?.("error", `No Outlook email found matching subject "${form.emailSubject}"`);
        return;
      }
      
      // Combine all matching emails into structured context for AI
      const combinedContext = res.rows.map((m) => 
        `Subject: ${m.subject}\nFrom: ${m.senderName} <${m.senderEmail}>\nReceived: ${m.receivedAt}\nTo: ${m.to}\n\n${m.body.trim()}`
      ).join("\n\n========================================\n\n");
      
      setFetchedEmailContext(combinedContext);
      onNotify?.("success", `Fetched ${res.rows.length} email(s) from Outlook as AI context. AI Analysis is now enabled!`);
    } catch (err) {
      setFetchedEmailContext(null);
      const msg = err instanceof Error ? err.message : String(err);
      onNotify?.("error", `Failed to fetch email from Outlook: ${msg}`);
    } finally {
      setFetchingEmail(false);
    }
  }

  async function executeAiGeneration(selections: { issueName: boolean; problemAnalysis: boolean; impactAnalysis: boolean }) {
    let combinedContext = "";
    if (fetchedEmailContext) {
      combinedContext += `=== OUTLOOK EMAIL CONTEXT ===\n${fetchedEmailContext}\n\n`;
    }
    if (fetchedGlpiContext) {
      combinedContext += `=== GLPI TICKET #${fetchedGlpiContext.ticketNumber} CONTEXT ===\n`;
      combinedContext += `Title: ${fetchedGlpiContext.title}\nOpened Date: ${fetchedGlpiContext.date}\nDescription:\n${fetchedGlpiContext.content}\n\n`;
      if (fetchedGlpiContext.technicians?.length) {
        combinedContext += `Technicians: ${fetchedGlpiContext.technicians.map((t) => t.fullName).join(", ")}\n`;
      }
      if (fetchedGlpiContext.requesters?.length) {
        combinedContext += `Requesters: ${fetchedGlpiContext.requesters.map((r) => r.fullName).join(", ")}\n`;
      }
      if (fetchedGlpiContext.followups?.length) {
        combinedContext += `\nFollowup / Discussion History:\n${fetchedGlpiContext.followups.map((f) => `[${f.date}] ${f.author}: ${f.content}`).join("\n")}\n`;
      }
      if (fetchedGlpiContext.solutions?.length) {
        combinedContext += `\nSolution:\n${fetchedGlpiContext.solutions.map((s) => `[${s.date}] ${s.solver}: ${s.content}`).join("\n")}\n`;
      }
    }

    if (!combinedContext.trim()) {
      onNotify?.("error", "No context available. Please fetch Email or GLPI content first.");
      return;
    }

    setGeneratingAi(true);
    try {
      const result = await generateAnalysis(combinedContext, form.emailSubject, form.issueName);
      
      let updatedCount = 0;
      if (selections.issueName && result.issueName) {
        update("issueName", result.issueName);
        updatedCount++;
      }
      if (selections.problemAnalysis && result.problemAnalysis) {
        update("problemAnalysis", result.problemAnalysis);
        updatedCount++;
      }
      if (selections.impactAnalysis && result.impactAnalysis) {
        update("impactAnalysis", result.impactAnalysis);
        updatedCount++;
      }

      // Auto-fill empty participant fields (never overwrite existing non-empty fields)
      if (result.participants) {
        for (const [role, nameVal] of Object.entries(result.participants)) {
          if (nameVal && nameVal.trim() && nameVal.trim().toUpperCase() !== "N/A") {
            const existingVal = form.participants?.[role]?.trim();
            if (!existingVal) {
              updateParticipant(role, nameVal.trim());
              updatedCount++;
            }
          }
        }
      }

      // Auto-fill empty timeline date fields (never overwrite existing non-empty fields)
      if (result.timeline) {
        for (const [tKey, dateVal] of Object.entries(result.timeline)) {
          if (dateVal && dateVal.trim() && dateVal.trim().toUpperCase() !== "N/A") {
            const existingVal = form.timeline?.[tKey]?.trim();
            if (!existingVal) {
              updateTimeline(tKey, dateVal.trim());
              updatedCount++;
            }
          }
        }
      }

      if (updatedCount > 0) {
        onNotify?.("success", `Generated & filled AI data for ${updatedCount} field(s) successfully!`);
      } else {
        onNotify?.("error", "AI generation returned empty or already existing results. Please try clicking Generate AI again.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onNotify?.("error", `AI Generation Error: ${msg}`);
    } finally {
      setGeneratingAi(false);
    }
  }

  async function handleGenerateAiAnalysis() {
    if (!fetchedEmailContext && !fetchedGlpiContext) {
      onNotify?.("error", "No email or GLPI context available. Please fetch Email or GLPI content first.");
      return;
    }
    
    const hasExistingName = Boolean(form.issueName?.trim());
    const hasExistingProblem = Boolean(form.problemAnalysis?.trim());
    const hasExistingImpact = Boolean(form.impactAnalysis?.trim());

    if (hasExistingName || hasExistingProblem || hasExistingImpact) {
      setAiOverwriteSelections({
        issueName: true,
        problemAnalysis: true,
        impactAnalysis: true
      });
      setShowAiOverwriteModal(true);
      return;
    }

    await executeAiGeneration({ issueName: true, problemAnalysis: true, impactAnalysis: true });
  }

  const [templatePreview, setTemplatePreview] = useState<{ title: string; body: string; bodyHtml?: string } | null>(null);
  const [templateBusy, setTemplateBusy] = useState<"" | "email" | "ticket" | "cr-transport">("");
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [missingPeople, setMissingPeople] = useState<IssuePersonCheck[]>([]);
  const [newPeople, setNewPeople] = useState<IssuePersonRegistration[]>([]);
  const [pendingSavePayload, setPendingSavePayload] = useState<IssueSavePayload | null>(null);

  useEffect(() => {
    const nextForm = issueFormFromDetail(detail);
    initialFormRef.current = nextForm;
    setForm(nextForm);
    setCreateMode("new");
    setBaseIssueSearch("");
    setBaseIssueCandidates([]);
    setShowBaseIssueCandidates(false);
    setCrPreview({});
    setGlpiPreview({});
    setCancelReason(detail?.issue?.cancelled_reason || "");
    setDeleteConfirm("");
    setActionDialog("");
    setTemplatePreview(null);
    setGenerateMenuOpen(false);
    setMoreMenuOpen(false);
    onDirtyChange?.(false);
  }, [detail?.issue?.id, mode]);

  useEffect(() => {
    if (mode === "change" && detail?.issue && initialAction) setActionDialog(initialAction);
  }, [mode, detail?.issue?.id, initialAction]);

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
    const payload = {
      ...form,
      createMode: mode === "create" ? createMode : undefined,
      issueNo: mode === "create" && createMode === "new" ? undefined : form.issueNo
    };
    setSaving(true);
    try {
      const validation = await validateIssuePeople(peopleChecksFromIssuePayload(payload));
      if (validation.missing.length) {
        setMissingPeople(validation.missing);
        setNewPeople(validation.missing.map((person) => ({
          fullName: person.mode === "full_name" ? person.name : "",
          nickname: person.mode === "nickname" ? person.name : "",
          department: "IT"
        })));
        setPendingSavePayload(payload);
        return;
      }
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  async function registerMissingPeopleAndSave() {
    if (!pendingSavePayload) return;
    if (newPeople.some((person) => !person.fullName?.trim() || !person.nickname?.trim() || !person.department?.trim())) return;
    setSaving(true);
    try {
      await registerIssuePeople(newPeople);
      setMissingPeople([]);
      setNewPeople([]);
      const payload = pendingSavePayload;
      setPendingSavePayload(null);
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  function updateNewPerson(index: number, key: keyof IssuePersonRegistration, value: string) {
    setNewPeople((current) => current.map((person, rowIndex) => rowIndex === index ? { ...person, [key]: value } : person));
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
  const glpiTokens = splitTokenValues(form.glpiTickets).filter((token) => /^\d+$/.test(token));
  const glpiLookupKey = glpiTokens.join("|");
  const hasSavedGlpiNo = Boolean(detail?.glpi?.length);
  const hasSavedCrLink = Boolean(detail?.crLinks?.length);
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
    if (!glpiLookupKey) return;
    const missing = glpiTokens.filter((token) => !glpiPreview[token]);
    if (!missing.length) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      Promise.all(missing.map(async (token) => {
        try {
          const result = await fetchValueHelp("glpi", token);
          const row = result.rows.find((item) => String(item.ticket_number || "") === token) || result.rows[0];
          return {
            token,
            preview: row ? {
              title: String(row.title || ""),
              openedAt: row.opened_at ? String(row.opened_at) : "",
              status: row.status ? String(row.status) : ""
            } : { notFound: true }
          };
        } catch {
          return { token, preview: { notFound: true } };
        }
      })).then((items) => {
        if (cancelled) return;
        setGlpiPreview((current) => {
          const next = { ...current };
          for (const item of items) next[item.token] = item.preview;
          return next;
        });
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [glpiLookupKey]);

  useEffect(() => {
    setExpandedPhases({
      initiation: true,
      dev: hasCrAssigned,
      qa: qaReady,
      prd: prdReady
    });
  }, [detail?.issue?.id, hasCrAssigned, qaReady, prdReady]);

  useEffect(() => {
    if (!navigationRequest) return;
    setExpandedPhases((current) => expandSection(current, navigationRequest.item.section));
    return afterIncompleteSectionRender(() => {
      const target = document.querySelector<HTMLElement>(`[data-incomplete-target="${navigationRequest.item.targetId}"]`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      markIncompleteTarget(target);
      const focusTarget = target.matches("input, select, textarea, button")
        ? target
        : target.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)");
      focusTarget?.focus({ preventScroll: true });
    });
  }, [navigationRequest]);

  function togglePhase(phase: IssueSection) {
    setExpandedPhases((current) => ({ ...current, [phase]: !current[phase] }));
  }

  async function cancelCurrentIssue() {
    if (!detail?.issue || !onCancel) return;
    const reason = cancelReason.trim();
    if (!reason) return;
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
    setActionBusy("delete");
    try {
      await onDelete(detail.issue.id);
      setActionDialog("");
    } finally {
      setActionBusy("");
    }
  }

  async function generateTemplate(kind: "email" | "ticket") {
    if (!detail?.issue?.id) {
      setTemplatePreview({
        title: kind === "email" ? "Generate Email Template" : "Generate GLPI Ticket Template",
        body: "Save issue terlebih dahulu sebelum generate template."
      });
      return;
    }
    setTemplateBusy(kind);
    try {
      setTemplatePreview(await fetchIssueTemplate(detail.issue.id, kind));
    } catch (err) {
      setTemplatePreview({
        title: kind === "email" ? "Generate Email Template" : "Generate GLPI Ticket Template",
        body: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setTemplateBusy("");
    }
  }

  async function generateCrTransportTemplate() {
    if (!detail?.issue?.id) {
      setTemplatePreview({
        title: "Generate CR Form",
        body: "Save issue terlebih dahulu sebelum generate CR Form."
      });
      return;
    }
    setTemplateBusy("cr-transport");
    try {
      await downloadCrTransportTemplate(detail.issue.id);
    } catch (err) {
      setTemplatePreview({
        title: "Generate CR Form",
        body: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setTemplateBusy("");
    }
  }

  if (mode === "change" && !detail?.issue) {
    return <section className="panel issue-editor-panel"><h2>Change Issue</h2><p className="empty">Pilih issue dari menu Report terlebih dahulu.</p></section>;
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
                <Plus size={15} /> New Issue
              </button>
              <button type="button" className={createMode === "sub" ? "active" : ""} onClick={() => {
                setCreateMode("sub");
                setForm((current) => ({ ...current, createMode: "sub" }));
                setShowBaseIssueCandidates(true);
              }}>
                <Plus size={15} /> Add Sub Issue
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
        <div className="phase-title phase-toggle" style={{ cursor: "default", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <button type="button" onClick={() => togglePhase("initiation")} style={{ display: "flex", alignItems: "flex-start", background: "none", border: "none", padding: 0, margin: 0, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}>
            <ChevronDown size={18} style={{ marginTop: "0.25rem", marginRight: "0.75rem", transform: expandedPhases.initiation ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
            <div>
              <h2 style={{ margin: "0 0 0.25rem 0" }}>Issue Initiation</h2>
              <p style={{ margin: 0 }}>Initial issue details, analysis, requester, ABAPer, and supporting references.</p>
            </div>
          </button>
          <span className="phase-title-actions" style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginLeft: "auto" }}>
            {expandedPhases.initiation && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                {/* Context Status Pills (Checkmarks) */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginRight: "0.25rem" }}>
                  <span className={`context-status-pill ${fetchedEmailContext ? "active" : "inactive"}`} title={fetchedEmailContext ? "Email context fetched & ready" : "No email context fetched"}>
                    {fetchedEmailContext ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {fetchedEmailContext ? "Email Context" : "No Email"}
                  </span>

                  <span className={`context-status-pill ${fetchedGlpiContext ? "active" : "inactive"}`} title={fetchedGlpiContext ? `GLPI #${fetchedGlpiContext.ticketNumber} context fetched` : "No GLPI context fetched"}>
                    {fetchedGlpiContext ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {fetchedGlpiContext ? `GLPI #${fetchedGlpiContext.ticketNumber}` : "No GLPI"}
                  </span>
                </div>

                {/* Fetch Email Button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleFetchEmailContent(); }}
                  disabled={formDisabled || fetchingEmail || !form.emailSubject?.trim()}
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "var(--color-primary, #2563eb)", color: "white", border: "none", cursor: (formDisabled || fetchingEmail || !form.emailSubject?.trim()) ? "not-allowed" : "pointer", fontSize: "0.8125rem", fontWeight: "600", whiteSpace: "nowrap", transition: "all 0.2s", opacity: (formDisabled || fetchingEmail || !form.emailSubject?.trim()) ? 0.6 : 1 }}
                  title="Fetch email content from Outlook Desktop"
                >
                  {fetchingEmail ? <Loader2 className="spinner" size={14} /> : <Mail size={14} />}
                  {fetchingEmail ? "Fetching..." : "Fetch Email"}
                </button>

                {/* Fetch GLPI Button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleFetchGlpiContent(); }}
                  disabled={formDisabled || fetchingGlpi || !form.glpiTickets?.trim()}
                  style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "#0f766e", color: "white", border: "none", cursor: (formDisabled || fetchingGlpi || !form.glpiTickets?.trim()) ? "not-allowed" : "pointer", fontSize: "0.8125rem", fontWeight: "600", whiteSpace: "nowrap", transition: "all 0.2s", opacity: (formDisabled || fetchingGlpi || !form.glpiTickets?.trim()) ? 0.6 : 1 }}
                  title="Fetch GLPI ticket details & discussion context"
                >
                  {fetchingGlpi ? <Loader2 className="spinner" size={14} /> : <Search size={14} />}
                  {fetchingGlpi ? "Fetching..." : "Fetch GLPI"}
                </button>

                {/* Generate AI Button */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGenerateAiAnalysis(); }}
                  disabled={formDisabled || (!fetchedEmailContext && !fetchedGlpiContext) || generatingAi}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "6px",
                    background: (!fetchedEmailContext && !fetchedGlpiContext || formDisabled || generatingAi) ? "var(--color-bg-subtle, #e5e7eb)" : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    color: (!fetchedEmailContext && !fetchedGlpiContext || formDisabled || generatingAi) ? "var(--color-text-muted, #9ca3af)" : "#ffffff",
                    border: "none",
                    cursor: (!fetchedEmailContext && !fetchedGlpiContext || formDisabled || generatingAi) ? "not-allowed" : "pointer",
                    fontSize: "0.8125rem",
                    fontWeight: "600",
                    transition: "all 0.2s"
                  }}
                  title={(!fetchedEmailContext && !fetchedGlpiContext) ? "Fetch Email or GLPI content first to enable AI generation" : "Generate Problem & Impact Analysis using OpenRouter AI"}
                >
                  {generatingAi ? <Loader2 className="spinner" size={14} /> : <Sparkles size={14} />}
                  {generatingAi ? "Generating..." : "Generate AI"}
                </button>
              </div>
            )}
            <button type="button" onClick={() => togglePhase("initiation")} className="phase-chevron" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.8125rem", fontWeight: "600" }}>
              {expandedPhases.initiation ? "Hide" : "Show"}
            </button>
          </span>
        </div>
        {expandedPhases.initiation ? (
          <div className="issue-initiation-layout">
          <div className="issue-initiation-column issue-initiation-main">
            <div className="initiation-section">
              <h3>Issue Information</h3>
              <div className="initiation-pair">
                <label>Issue No.<input className="readonly-input" value={displayedIssueNo} onChange={(event) => update("issueNo", event.target.value)} placeholder="Auto" readOnly={mode === "create"} disabled={formDisabled} /></label>
                <label>Sub Issue<input className={mode === "create" ? "readonly-input" : ""} value={displayedSubIssueNo} onChange={(event) => update("subIssueNo", event.target.value)} readOnly={mode === "create"} disabled={formDisabled} /></label>
              </div>
              <label data-incomplete-target="issue-name">Issue Name<input value={form.issueName || ""} onChange={(event) => update("issueName", event.target.value)} required disabled={formDisabled} /></label>
              <div className="initiation-pair">
                <label>Status<select value={form.sourceIssueStatus || "open"} onChange={(event) => update("sourceIssueStatus", event.target.value)} disabled={formDisabled}>
                  <option value="open">Open</option>
                  <option value="ok">OK</option>
                  {isCancelled ? <option value="cancelled">Cancelled</option> : null}
                </select></label>
                <div className="incomplete-target" data-incomplete-target="issue-created-on">
                  <TimestampInput label="Created On" value={form.createIssueDate} onChange={(value) => update("createIssueDate", value)} disabled={formDisabled} />
                </div>
              </div>
              <label>
                Email Subject
                <input value={form.emailSubject || ""} onChange={(event) => update("emailSubject", event.target.value)} placeholder="Email subject" disabled={formDisabled} style={{ width: "100%", marginTop: "0.25rem" }} />
              </label>
              <a href="/api/outlook/download-agent" style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)", marginTop: "0.25rem", display: "inline-block" }}>
                "Fetch Email" tidak jalan? Download &amp; jalankan Outlook Agent di laptop Anda
              </a>
            </div>
            <div className="initiation-section">
              <h3 style={{ margin: "0 0 0.5rem 0" }}>Analysis</h3>
              <label>Problem Analysis<textarea value={form.problemAnalysis || ""} onChange={(event) => update("problemAnalysis", event.target.value)} rows={6} disabled={formDisabled} /></label>
              <label>Impact Analysis<textarea value={form.impactAnalysis || ""} onChange={(event) => update("impactAnalysis", event.target.value)} rows={6} disabled={formDisabled} /></label>
            </div>
          </div>

          <div className="issue-initiation-column issue-initiation-reference">
            <div className="initiation-section">
              <h3>References</h3>
              <div className="initiation-pair reference-pair">
                <div className="reference-field-group" data-incomplete-target="issue-glpi">
                  <ValueHelpField label="CR Helpdesk No." kind="cr-helpdesk" value={form.crHelpdeskNumbers || ""} onChange={(value) => update("crHelpdeskNumbers", value)} placeholder="CR Helpdesk No." disabled={formDisabled} />
                </div>
                <div className="reference-field-group">
                  <ValueHelpField
                    label="GLPI No."
                    kind="glpi"
                    value={form.glpiTickets || ""}
                    onChange={(value) => update("glpiTickets", value)}
                    onSelectRow={(row) => {
                      const ticket = String(row.ticket_number || "");
                      if (!ticket) return;
                      setGlpiPreview((current) => ({
                        ...current,
                        [ticket]: {
                          title: String(row.title || ""),
                          openedAt: row.opened_at ? String(row.opened_at) : "",
                          status: row.status ? String(row.status) : ""
                        }
                      }));
                    }}
                    placeholder="16095; 16096"
                    disabled={formDisabled}
                  />
                  {glpiTokens.length ? (
                    <div className="reference-hints">
                      {glpiTokens.map((ticket) => {
                        const preview = glpiPreview[ticket];
                        const meta = [formatValueHelpDate(preview?.openedAt), formatGlpiStatus(preview?.status)].filter(Boolean).join(" - ");
                        return (
                          <div className={`reference-hint glpi-reference-hint ${preview?.notFound ? "muted" : ""}`} key={ticket}>
                            <div>
                              <strong>{preview?.notFound ? "Ticket not found" : preview?.title || "Looking up GLPI ticket..."}</strong>
                              {meta ? <small>{meta}</small> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="incomplete-target" data-incomplete-target="issue-cr">
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
              </div>
              {crTokens.length ? (
                <div className="reference-hints">
                  {crTokens.map((trkorr) => {
                    const preview = previewForCr(trkorr);
                    const description = preview?.description || "Description will appear after the CR is cached/selected.";
                    const status = preview?.status ? formatStatusLabel(preview.status) : "Status unknown";
                    return (
                      <div className="reference-hint cr-reference-hint" key={trkorr}>
                        <div>
                          <strong>{description}</strong>
                        </div>
                        <em>{status}</em>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="initiation-section">
              <h3>People</h3>
              <div className="repeatable-row-field" data-incomplete-target="issue-requesters">
                <MultiValueHelpField label="Requester" kind="people" role="requester" personMode="full_name" value={form.requesterNames || ""} onChange={(value) => update("requesterNames", value)} placeholder="Full name" disabled={formDisabled} />
              </div>
              <div className="repeatable-row-field" data-incomplete-target="issue-abapers">
                <MultiValueHelpField label="ABAPer" kind="people" role="abaper" personMode="full_name" value={form.abaperNames || ""} onChange={(value) => update("abaperNames", value)} placeholder="Full name" disabled={formDisabled} />
              </div>
              {isCancelled ? (
                <section className="issue-cancel-card">
                  <small>Cancel Reason</small>
                  <strong>{form.cancelledReason || detail?.issue?.cancelled_reason || "-"}</strong>
                </section>
              ) : null}
            </div>
          </div>
          </div>
        ) : null}
      </section>

      <section className={`panel editor-section issue-phase-card ${hasCrAssigned ? "" : "phase-muted"}`}>
        <button className="phase-title phase-toggle" type="button" onClick={() => togglePhase("dev")}>
          <ChevronDown size={18} />
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
            <ValueHelpField label="DEV Tester" kind="people" role="tester" personMode="full_name" value={form.participants?.dev_tester || ""} onChange={(value) => updateParticipant("dev_tester", value)} placeholder="Full name" disabled={devDisabled} incompleteTarget="issue-dev-tester" />
            <TimestampInput label="Testing Date" value={form.timeline?.dev_tested_date} onChange={(value) => updateTimeline("dev_tested_date", value)} disabled={devDisabled} incompleteTarget="issue-dev-testing-date" />
            <ValueHelpField label="DEV Evaluator" kind="people" role="evaluator" personMode="full_name" value={form.participants?.dev_evaluator || ""} onChange={(value) => updateParticipant("dev_evaluator", value)} placeholder="Full name" disabled={devDisabled} incompleteTarget="issue-dev-evaluator" />
            <TimestampInput label="Evaluation Date" value={form.timeline?.dev_evaluated_date} onChange={(value) => updateTimeline("dev_evaluated_date", value)} disabled={devDisabled} incompleteTarget="issue-dev-evaluation-date" />
          </div>
        ) : null}
      </section>

      <section className={`panel editor-section issue-phase-card ${qaReady ? "" : "phase-muted"}`}>
        <button className="phase-title phase-toggle" type="button" onClick={() => togglePhase("qa")}>
          <ChevronDown size={18} />
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
            <ValueHelpField label="QA Transporter" kind="people" role="transporter" personMode="full_name" value={form.participants?.qa_transporter || ""} onChange={(value) => updateParticipant("qa_transporter", value)} placeholder="Full name" disabled={qaDisabled} incompleteTarget="issue-qa-transporter" />
            <label>Transport Date<input className="readonly-input" value={formatIssueTimestamp(primaryCr?.qa_import_date, primaryCr?.qa_import_time)} readOnly /></label>
            <ValueHelpField label="QA Tester" kind="people" role="tester" personMode="full_name" value={form.participants?.qa_tester || ""} onChange={(value) => updateParticipant("qa_tester", value)} placeholder="Full name" disabled={qaDisabled} incompleteTarget="issue-qa-tester" />
            <TimestampInput label="Testing Date" value={form.timeline?.qa_tested_date} onChange={(value) => updateTimeline("qa_tested_date", value)} disabled={qaDisabled} incompleteTarget="issue-qa-testing-date" />
            <ValueHelpField label="QA Evaluator" kind="people" role="evaluator" personMode="full_name" value={form.participants?.qa_evaluator || ""} onChange={(value) => updateParticipant("qa_evaluator", value)} placeholder="Full name" disabled={qaDisabled} incompleteTarget="issue-qa-evaluator" />
            <TimestampInput label="Evaluation Date" value={form.timeline?.qa_evaluated_date} onChange={(value) => updateTimeline("qa_evaluated_date", value)} disabled={qaDisabled} incompleteTarget="issue-qa-evaluation-date" />
          </div>
        ) : null}
      </section>

      <section className={`panel editor-section issue-phase-card ${prdReady ? "" : "phase-muted"}`}>
        <button className="phase-title phase-toggle" type="button" onClick={() => togglePhase("prd")}>
          <ChevronDown size={18} />
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
            <ValueHelpField label="PRD Requester" kind="people" role="requester" personMode="full_name" value={form.participants?.prd_requester || ""} onChange={(value) => updateParticipant("prd_requester", value)} placeholder="Full name" disabled={prdRequestDisabled} incompleteTarget="issue-prd-requester" />
            <TimestampInput label="Request Date" value={form.timeline?.prd_requested_date} onChange={(value) => updateTimeline("prd_requested_date", value)} disabled={prdRequestDisabled} incompleteTarget="issue-prd-request-date" />
            <ValueHelpField label="PRD Evaluator" kind="people" role="evaluator" personMode="full_name" value={form.participants?.prd_evaluator || ""} onChange={(value) => updateParticipant("prd_evaluator", value)} placeholder="Full name" disabled={prdRequestDisabled} incompleteTarget="issue-prd-evaluator" />
            <TimestampInput label="Evaluation Date" value={form.timeline?.prd_evaluated_date} onChange={(value) => updateTimeline("prd_evaluated_date", value)} disabled={prdRequestDisabled} incompleteTarget="issue-prd-evaluation-date" />
            <ValueHelpField label="Approver" kind="people" role="approver" personMode="full_name" value={form.participants?.approval || ""} onChange={(value) => updateParticipant("approval", value)} placeholder="Full name" disabled={prdRequestDisabled} incompleteTarget="issue-approver" />
            <TimestampInput label="Approval Date" value={form.timeline?.approval_date} onChange={(value) => updateTimeline("approval_date", value)} disabled={prdRequestDisabled} incompleteTarget="issue-approval-date" />
            <ValueHelpField label="PRD Transporter" kind="people" role="transporter" personMode="full_name" value={form.participants?.executor || ""} onChange={(value) => updateParticipant("executor", value)} placeholder="Full name" disabled={prdTransportDisabled} incompleteTarget="issue-prd-transporter" />
            <label>Transport Date<input className="readonly-input" value={formatIssueTimestamp(primaryCr?.prd_import_date, primaryCr?.prd_import_time)} readOnly /></label>
          </div>
        ) : null}
      </section>
      <div className="editor-safe-space" aria-hidden="true" />
      <div className="issue-save-bar">
        <span>Actions</span>
        <div className="sticky-actions">
          {mode === "change" ? (
            <>
              <div className="sticky-action-menu">
                <button className="secondary" type="button" onClick={() => {
                  setGenerateMenuOpen((current) => !current);
                  setMoreMenuOpen(false);
                }} disabled={templateBusy !== "" || !detail?.issue?.id}>
                  <FileOutput size={16} /> {templateBusy ? "Generating" : "Generate"} <ChevronDown size={14} />
                </button>
                {generateMenuOpen ? (
                  <div className="sticky-action-menu-list">
                    <button type="button" onClick={() => {
                      setGenerateMenuOpen(false);
                      generateTemplate("ticket");
                    }}><FileOutput size={15} /> GLPI Ticket Template</button>
                    {hasSavedCrLink && hasSavedGlpiNo ? (
                      <button type="button" onClick={() => {
                        setGenerateMenuOpen(false);
                        generateTemplate("email");
                      }}><FileOutput size={15} /> Email Template</button>
                    ) : null}
                    {hasSavedCrLink ? (
                      <button type="button" onClick={() => {
                        setGenerateMenuOpen(false);
                        generateCrTransportTemplate();
                      }}><FileOutput size={15} /> CR Form</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {mode === "change" && detail?.issue ? (
            <div className="sticky-action-menu">
              <button className="secondary" type="button" onClick={() => {
                setMoreMenuOpen((current) => !current);
                setGenerateMenuOpen(false);
              }}><MoreVertical size={16} /> More <ChevronDown size={14} /></button>
              {moreMenuOpen ? (
                <div className="sticky-action-menu-list">
                  {!isCancelled ? (
                    <button type="button" onClick={() => {
                      setMoreMenuOpen(false);
                      setActionDialog("cancel");
                    }}><Ban size={15} /> Cancel Issue</button>
                  ) : null}
                  <button className="danger-menu-item" type="button" onClick={() => {
                    setMoreMenuOpen(false);
                    setActionDialog("delete");
                  }}><Trash2 size={15} /> Delete Issue</button>
                </div>
              ) : null}
              {isCancelled ? <span className="readonly-note">Cancelled issue is read-only.</span> : null}
            </div>
          ) : null}
          {!isCancelled ? <button className="primary" type="submit" disabled={saving}><Save size={16} /> {saving ? "Saving" : "Save"}</button> : null}
        </div>
      </div>
      {templatePreview ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card template-preview-modal" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
            <h2 id="template-preview-title">{templatePreview.title}</h2>
            {templatePreview.bodyHtml ? (
              <div className="template-preview-body" dangerouslySetInnerHTML={{ __html: templatePreview.bodyHtml }} />
            ) : (
              <pre>{templatePreview.body}</pre>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setTemplatePreview(null)}><X size={15} /> Close</button>
            </div>
          </section>
        </div>
      ) : null}
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
                  <button type="button" className="secondary" onClick={() => setActionDialog("")}><X size={15} /> Close</button>
                  <button type="button" className="danger-secondary" disabled={!cancelReason.trim() || actionBusy === "cancel"} onClick={cancelCurrentIssue}>
                    <Ban size={15} /> {actionBusy === "cancel" ? "Cancelling" : "Confirm Cancel"}
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
                  <button type="button" className="secondary" onClick={() => setActionDialog("")}><X size={15} /> Close</button>
                  <button type="button" className="danger" disabled={deleteConfirm.trim() !== issueKey || actionBusy === "delete"} onClick={deleteCurrentIssue}>
                    <Trash2 size={15} /> {actionBusy === "delete" ? "Deleting" : "Confirm Delete"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
      {missingPeople.length ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card people-registration-modal" role="dialog" aria-modal="true" aria-labelledby="people-registration-title">
            <h2 id="people-registration-title">Complete People Master Data</h2>
            <p>The following names are not fully registered in the database. Please complete person details before saving.</p>
            <div className="people-registration-list">
              {missingPeople.map((person, index) => (
                <div className="people-registration-row" key={`${person.mode}-${person.name}-${index}`}>
                  <strong>{person.name}</strong>
                  <small>{person.mode === "full_name" ? "Expected as full name" : "Expected as nickname"}</small>
                  <label>Full Name
                    <input value={newPeople[index]?.fullName || ""} onChange={(event) => updateNewPerson(index, "fullName", event.target.value)} required />
                  </label>
                  <label>Nickname
                    <input value={newPeople[index]?.nickname || ""} onChange={(event) => updateNewPerson(index, "nickname", event.target.value)} required />
                  </label>
                  <label>Department
                    <input value={newPeople[index]?.department || ""} onChange={(event) => updateNewPerson(index, "department", event.target.value)} required />
                  </label>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => {
                setMissingPeople([]);
                setNewPeople([]);
                setPendingSavePayload(null);
              }}><X size={15} /> Cancel</button>
              <button type="button" className="primary" disabled={saving || newPeople.some((person) => !person.fullName?.trim() || !person.nickname?.trim() || !person.department?.trim())} onClick={registerMissingPeopleAndSave}>
                <Save size={15} /> {saving ? "Saving" : "Save People and Issue"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <UIModal
        isOpen={showAiOverwriteModal}
        onClose={() => setShowAiOverwriteModal(false)}
        title="Replace Existing Content?"
        subtitle="Some fields already contain text. Check the fields you want AI to replace:"
        type="purple"
        confirmText="Generate AI"
        cancelText="Cancel"
        confirmDisabled={!aiOverwriteSelections.issueName && !aiOverwriteSelections.problemAnalysis && !aiOverwriteSelections.impactAnalysis}
        onConfirm={async () => {
          setShowAiOverwriteModal(false);
          await executeAiGeneration(aiOverwriteSelections);
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "var(--color-bg-subtle, #f8fafc)", padding: "1rem", borderRadius: "10px", border: "1px solid var(--color-border, #e2e8f0)" }}>
          {Boolean(form.issueName?.trim()) && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer", fontSize: "0.875rem", color: "var(--color-text, #1f2937)", padding: "0.375rem 0" }}>
              <input
                type="checkbox"
                checked={aiOverwriteSelections.issueName}
                onChange={(e) => setAiOverwriteSelections(prev => ({ ...prev, issueName: e.target.checked }))}
                style={{ marginTop: "0.2rem", width: "1.1rem", height: "1.1rem", accentColor: "#6366f1" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Replace Issue Name</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)", fontStyle: "italic", marginTop: "0.125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "380px" }}>
                  Current: "{form.issueName}"
                </div>
              </div>
            </label>
          )}

          {Boolean(form.problemAnalysis?.trim()) && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer", fontSize: "0.875rem", color: "var(--color-text, #1f2937)", padding: "0.375rem 0" }}>
              <input
                type="checkbox"
                checked={aiOverwriteSelections.problemAnalysis}
                onChange={(e) => setAiOverwriteSelections(prev => ({ ...prev, problemAnalysis: e.target.checked }))}
                style={{ marginTop: "0.2rem", width: "1.1rem", height: "1.1rem", accentColor: "#6366f1" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Replace Problem Analysis</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)", fontStyle: "italic", marginTop: "0.125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "380px" }}>
                  Current: "{form.problemAnalysis?.slice(0, 60)}..."
                </div>
              </div>
            </label>
          )}

          {Boolean(form.impactAnalysis?.trim()) && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer", fontSize: "0.875rem", color: "var(--color-text, #1f2937)", padding: "0.375rem 0" }}>
              <input
                type="checkbox"
                checked={aiOverwriteSelections.impactAnalysis}
                onChange={(e) => setAiOverwriteSelections(prev => ({ ...prev, impactAnalysis: e.target.checked }))}
                style={{ marginTop: "0.2rem", width: "1.1rem", height: "1.1rem", accentColor: "#6366f1" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Replace Impact Analysis</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)", fontStyle: "italic", marginTop: "0.125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "380px" }}>
                  Current: "{form.impactAnalysis?.slice(0, 60)}..."
                </div>
              </div>
            </label>
          )}
        </div>
      </UIModal>
    </form>
  );
}

function ChangeIssue({
  initialIssueId,
  initialAction = "",
  initialIncompleteItem = null,
  refreshToken = 0,
  onSave,
  onCancel,
  onDelete,
  onNotify,
  onDirtyChange
}: {
  initialIssueId?: number | null;
  initialAction?: "" | "cancel" | "delete";
  initialIncompleteItem?: IncompleteItem | null;
  refreshToken?: number;
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
  const [navigationRequest, setNavigationRequest] = useState<{ sequence: number; item: IncompleteItem } | null>(null);
  const loadedInitialIssueId = useRef<number | null>(null);
  const searchKey = `${selection.q.trim()}|${selection.glpi.trim()}|${selection.crHelpdesk.trim()}|${selection.cr.trim()}`;

  useEffect(() => {
    if (!initialIssueId || loadedInitialIssueId.current === initialIssueId) return;
    loadedInitialIssueId.current = initialIssueId;
    setSearching(true);
    fetchIssueDetail(initialIssueId)
      .then((nextDetail) => {
        setChangeDetail(nextDetail);
        setSelection({
          q: nextDetail.issue?.issue_key || "",
          glpi: nextDetail.issue?.primary_glpi_ticket ? String(nextDetail.issue.primary_glpi_ticket) : "",
          crHelpdesk: nextDetail.issue?.primary_cr_helpdesk_no || "",
          cr: nextDetail.issue?.primary_cr || ""
        });
        setCandidates([]);
        setShowCandidates(false);
        setSearched(false);
      })
      .catch((err) => onNotify("error", err instanceof Error ? err.message : String(err)))
      .finally(() => setSearching(false));
  }, [initialIssueId, onNotify]);

  useEffect(() => {
    if (!initialIncompleteItem || !initialIssueId || changeDetail?.issue?.id !== initialIssueId) return;
    setNavigationRequest((current) => ({ sequence: (current?.sequence || 0) + 1, item: initialIncompleteItem }));
  }, [changeDetail?.issue?.id, initialIncompleteItem, initialIssueId]);

  useEffect(() => {
    if (!refreshToken || !changeDetail?.issue?.id) return;
    fetchIssueDetail(changeDetail.issue.id)
      .then(setChangeDetail)
      .catch((err) => onNotify("error", err instanceof Error ? err.message : String(err)));
  }, [refreshToken]);

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

  const missing = changeDetail?.issue && changeDetail.issue.issue_status !== "cancelled" ? getIncompleteItems(changeDetail) : [];
  const missingGroups = groupIncompleteItems(missing);

  function navigateToIncompleteItem(item: IncompleteItem) {
    setNavigationRequest((current) => ({ sequence: (current?.sequence || 0) + 1, item }));
  }

  return (
    <div className="issue-change-layout">
      <form className="panel issue-selection-panel" onSubmit={search}>
        <div className="panel-heading">
          <h2>Selection Parameter</h2>
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
            <details className="change-summary-details" open>
              <summary>{missing.length} incomplete item(s)</summary>
              <IncompleteGroupCards groups={missingGroups} onItemClick={navigateToIncompleteItem} />
            </details>
          ) : null}
        </section>
      ) : null}

      {changeDetail ? <IssueEditor mode="change" detail={changeDetail} initialAction={initialAction} navigationRequest={navigationRequest} onNotify={onNotify} onSave={onSave} onCancel={onCancel} onDelete={onDelete} onDirtyChange={onDirtyChange} /> : null}
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
  onSelectRow,
  personMode = "full_name",
  incompleteTarget,
  role
}: {
  label: string;
  kind: ValueHelpKind;
  personMode?: "full_name" | "nickname";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSelectRow?: (row: Record<string, unknown>) => void;
  incompleteTarget?: string;
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      fetchValueHelp(kind, lastToken(query), { role })
        .then((result) => setRows(result.rows))
        .catch(() => setRows([]));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [open, query, kind, role]);

  function choose(row: Record<string, unknown>) {
    const selected = valueHelpValue(kind, row, personMode);
    onChange(appendToken(value, selected));
    onSelectRow?.(row);
    setOpen(false);
  }

  return (
    <label
      className="value-help-field"
      data-incomplete-target={incompleteTarget}
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
              <strong>{valueHelpValue(kind, row, personMode)}</strong>
              <small>{valueHelpDescription(kind, row)}</small>
            </button>
          ))}
          {rows.length === 0 ? <span>No value found</span> : null}
        </div>
      ) : null}
    </label>
  );
}

function TimestampInput({
  label,
  value,
  onChange,
  disabled = false,
  incompleteTarget
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  incompleteTarget?: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputValue = toDatetimeInput(value);

  if (disabled) {
    return (
      <label className="timestamp-field" data-incomplete-target={incompleteTarget}>
        {label}
        <input className="readonly-input" value={formatIssueTimestamp(value)} disabled />
      </label>
    );
  }

  return (
    <label className={`timestamp-field ${editing ? "is-editing" : ""}`} data-incomplete-target={incompleteTarget}>
      {label}
      {editing ? (
        <input
          type="datetime-local"
          value={inputValue}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
        />
      ) : (
        <button type="button" className="timestamp-display-input" onClick={() => setEditing(true)}>
          <span>{formatIssueTimestamp(value)}</span>
        </button>
      )}
    </label>
  );
}

function MultiValueHelpField({
  label,
  kind,
  personMode = "full_name",
  value,
  onChange,
  placeholder,
  disabled = false,
  role
}: {
  label: string;
  kind: ValueHelpKind;
  personMode?: "full_name" | "nickname";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  role?: string;
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
        <button type="button" className="mini-action" onClick={addRow} disabled={disabled}><Plus size={14} /> Add</button>
      </div>
      {visibleRows.map((rowValue, index) => (
        <div className="multi-value-row" key={`${label}-${index}`}>
          <ValueHelpField
            label={`${label} ${index + 1}`}
            kind={kind}
            role={role}
            personMode={personMode}
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

function formatIssueLinkStatus(relationStatus: string, issueStatus?: string) {
  if (relationStatus === "cancelled") return "cancelled";
  if (relationStatus === "deleted") return "deleted";
  if (relationStatus === "replaced") return "replaced";
  return issueStatus || "active";
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
  if (status === "imported") return formatIssueTimestamp(value);
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
    case "active":
      return "Active";
    case "deleted":
      return "Deleted";
    case "replaced":
      return "Replaced";
    case "pending_qa":
      return "Pending to QA";
    case "in_qa":
      return "In QA";
    case "pending_prd":
      return "Pending to PRD";
    case "in_prd":
      return "In PRD";
    case "outstanding":
      return "Outstanding";
    case "released":
      return "Released";
    default:
      if (!value) return "Unknown";
      return value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
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
    const label = object.object_label || object.object_type_description || se03ObjectLabel(object.pgmid, object.object_type);
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

function formatGlpiStatus(value?: string) {
  if (!value) return "";
  const labels: Record<string, string> = {
    "1": "New",
    "2": "Processing",
    "3": "Planned",
    "4": "Pending",
    "5": "Solved",
    "6": "Closed"
  };
  return labels[value] || value;
}

function formatCrHelpdeskNumbers(detail: IssueDetail | null) {
  return detail?.crHelpdeskNumbers?.map((item) => item.cr_helpdesk_no)?.join("; ") || "";
}

function issueFormFromDetail(detail: IssueDetail | null): IssueSavePayload {
  const issue = detail?.issue;
  const participants = Object.fromEntries(
    PARTICIPANT_GROUPS.flatMap((group) => group.roles).map((role) => [
      role,
      (detail?.participants || [])
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
    glpiTickets: detail?.glpi?.map((ticket) => ticket.ticket_number)?.join("; ") || "",
    crHelpdeskNumbers: detail?.crHelpdeskNumbers?.map((item) => item.cr_helpdesk_no)?.join("; ") || "",
    crLinks: detail?.crLinks?.map((link) => link.trkorr)?.join("; ") || "",
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

function valueHelpValue(kind: ValueHelpKind, row: Record<string, unknown>, personMode: "full_name" | "nickname" = "full_name") {
  if (kind === "glpi") return String(row.ticket_number || "");
  if (kind === "cr-helpdesk") return String(row.cr_helpdesk_no || "");
  if (kind === "cr") return String(row.trkorr || "");
  return String(personMode === "nickname" ? row.nickname || row.full_name || "" : row.full_name || row.nickname || "");
}

function valueHelpDescription(kind: ValueHelpKind, row: Record<string, unknown>) {
  if (kind === "glpi") return [row.title, formatValueHelpDate(row.opened_at), row.status ? `status ${row.status}` : ""].filter(Boolean).join(" - ") || "GLPI ticket";
  if (kind === "cr-helpdesk") return "CR Helpdesk No.";
  if (kind === "cr") return [row.sap_system_code, row.status_group, row.description].filter(Boolean).join(" - ");
  return [row.nickname, row.department, row.email].filter(Boolean).join(" - ");
}

function formatValueHelpDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function splitTokenValues(value?: string) {
  return (value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function peopleChecksFromIssuePayload(payload: IssueSavePayload): IssuePersonCheck[] {
  const checks: IssuePersonCheck[] = [
    ...splitTokenValues(payload.requesterNames).map((name) => ({ name, mode: "full_name" as const })),
    ...splitTokenValues(payload.abaperNames).map((name) => ({ name, mode: "full_name" as const }))
  ];
  for (const group of PARTICIPANT_GROUPS) {
    for (const role of group.roles) {
      if (role === "requester" || role === "abaper") continue;
      checks.push(...splitTokenValues(payload.participants?.[role]).map((name) => ({ name, mode: "full_name" as const })));
    }
  }
  const seen = new Set<string>();
  return checks.filter((person) => {
    const key = `${person.mode}:${person.name.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  if (detail?.issue?.issue_status === "cancelled") {
    const cancelDate = detail.issue.cancelled_date || latestActivityDate(detail) || detail.issue.create_issue_date;
    const lastActivity = latestIssueActivityBefore(detail, cancelDate, ["Issue Created", "Issue Cancelled"]);
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
    { source: "Issue", label: "Issue Created", date: detail?.issue?.create_issue_date, order: 2 },
    { source: "Issue", label: "DEV Tested", date: readTimelineDate(detail?.devTimeline, "dev_tested_date"), order: 3 },
    { source: "Issue", label: "DEV Evaluated", date: readTimelineDate(detail?.devTimeline, "dev_evaluated_date"), order: 4 },
    { source: "Issue", label: "QA Tested", date: readTimelineDate(detail?.qaTimeline, "qa_tested_date"), order: 7 },
    { source: "Issue", label: "QA Evaluated", date: readTimelineDate(detail?.qaTimeline, "qa_evaluated_date"), order: 8 },
    { source: "Issue", label: "PRD Requested", date: readTimelineDate(detail?.prdTimeline, "prd_requested_date"), order: 9 },
    { source: "Issue", label: "PRD Evaluated", date: readTimelineDate(detail?.prdTimeline, "prd_evaluated_date"), order: 10 },
    { source: "Issue", label: "Approval", date: readTimelineDate(detail?.prdTimeline, "approval_date"), order: 11 }
  ];
}

function issueCrLifecycleEvents(detail: IssueDetail | null) {
  const primaryCr = detail?.crLinks?.find((link) => link.is_primary) || detail?.crLinks?.[0];
  return [
    { source: "CR", label: "Created", date: timelineDate(primaryCr?.sap_created_at), time: timelineClock(primaryCr?.sap_created_at), order: 1 },
    { source: "CR", label: "Released", date: timelineDate(primaryCr?.sap_released_at), time: timelineClock(primaryCr?.sap_released_at), order: 5 },
    { source: "CR", label: "In QA", date: primaryCr?.qa_import_date, time: primaryCr?.qa_import_time, order: 6 },
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

function latestIssueActivityBefore(detail: IssueDetail, maxDate?: string, excludeLabels: string[] = []) {
  const maxTime = maxDate ? new Date(maxDate).getTime() : Number.POSITIVE_INFINITY;
  return latestDatedEvent(issueOnlyActivityEvents(detail).filter((event) => {
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

function issueOnlyActivityEvents(detail: IssueDetail) {
  return [
    { source: "Issue", label: "Issue Created", date: detail.issue?.create_issue_date, order: 2 },
    { source: "Issue", label: "DEV Tested", date: readTimelineDate(detail.devTimeline, "dev_tested_date"), order: 3 },
    { source: "Issue", label: "DEV Evaluated", date: readTimelineDate(detail.devTimeline, "dev_evaluated_date"), order: 4 },
    { source: "Issue", label: "QA Tested", date: readTimelineDate(detail.qaTimeline, "qa_tested_date"), order: 7 },
    { source: "Issue", label: "QA Evaluated", date: readTimelineDate(detail.qaTimeline, "qa_evaluated_date"), order: 8 },
    { source: "Issue", label: "PRD Requested", date: readTimelineDate(detail.prdTimeline, "prd_requested_date"), order: 9 },
    { source: "Issue", label: "PRD Evaluated", date: readTimelineDate(detail.prdTimeline, "prd_evaluated_date"), order: 10 },
    { source: "Issue", label: "Approval", date: readTimelineDate(detail.prdTimeline, "approval_date"), order: 11 },
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

function completionWidth(value: number, total: number) {
  if (!total || value <= 0) return 0;
  return Math.max(6, Math.round((value / total) * 100));
}

function issueLifecycleLabel(value: string) {
  switch (value) {
    case "no_cr":
      return "No CR assigned";
    case "created":
      return "Created";
    case "released":
      return "Released";
    case "in_qa":
      return "In QA";
    case "in_prd":
      return "In PRD";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}
