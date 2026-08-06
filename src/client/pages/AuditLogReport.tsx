import React, { useState, useEffect } from "react";
import { Search, RefreshCw, Filter, ShieldCheck, User, Cpu, FileCode2, FolderGit2, Database, Settings, KeyRound } from "lucide-react";
import { fetchAuditLogs, ActivityLogItem, ActivityLogSummary, ActivityLogFilters } from "../api";

export function AuditLogReport() {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [summary, setSummary] = useState<ActivityLogSummary>({
    total: 0,
    sync_count: 0,
    issue_count: 0,
    project_count: 0,
    master_data_count: 0,
    setting_count: 0,
    auth_count: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [draftFilters, setDraftFilters] = useState<ActivityLogFilters>({
    activityType: "all",
    q: "",
    username: "",
    fromDate: "",
    toDate: ""
  });

  const [activeFilters, setActiveFilters] = useState<ActivityLogFilters>({
    activityType: "all",
    q: "",
    username: "",
    fromDate: "",
    toDate: ""
  });

  const loadData = async (filtersToUse = activeFilters, targetPage = page) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAuditLogs({
        ...filtersToUse,
        page: targetPage,
        pageSize: 25
      });
      setLogs(res.rows);
      setSummary(res.summary);
      setTotalPages(res.totalPages);
      setTotalCount(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeFilters, page);
  }, [activeFilters, page]);

  const handleApplyFilter = () => {
    setPage(1);
    setActiveFilters({ ...draftFilters });
  };

  const handleResetFilter = () => {
    const empty: ActivityLogFilters = { activityType: "all", q: "", username: "", fromDate: "", toDate: "" };
    setDraftFilters(empty);
    setPage(1);
    setActiveFilters(empty);
  };

  const getActivityBadge = (type: string) => {
    switch (type) {
      case "sync":
        return <span className="status-badge" style={{ background: "#fef3c7", color: "#b45309", display: "inline-flex", alignItems: "center", gap: "4px" }}><Cpu size={12} /> Sync</span>;
      case "issue":
        return <span className="status-badge" style={{ background: "#e0f2fe", color: "#0369a1", display: "inline-flex", alignItems: "center", gap: "4px" }}><FileCode2 size={12} /> Issue</span>;
      case "project":
        return <span className="status-badge" style={{ background: "#f3e8ff", color: "#6b21a8", display: "inline-flex", alignItems: "center", gap: "4px" }}><FolderGit2 size={12} /> Project</span>;
      case "master_data":
        return <span className="status-badge" style={{ background: "#ccfbf1", color: "#0f766e", display: "inline-flex", alignItems: "center", gap: "4px" }}><Database size={12} /> Master Data</span>;
      case "setting":
        return <span className="status-badge" style={{ background: "#f1f5f9", color: "#334155", display: "inline-flex", alignItems: "center", gap: "4px" }}><Settings size={12} /> Setting</span>;
      case "auth":
        return <span className="status-badge" style={{ background: "#dcfce7", color: "#15803d", display: "inline-flex", alignItems: "center", gap: "4px" }}><KeyRound size={12} /> Auth</span>;
      default:
        return <span className="status-badge">{type}</span>;
    }
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return "-";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    const handleRefresh = () => loadData(activeFilters, page);
    window.addEventListener("trigger-refresh-audit-log", handleRefresh);
    return () => window.removeEventListener("trigger-refresh-audit-log", handleRefresh);
  }, [activeFilters, page]);

  return (
    <div className="report-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Metric Collages */}
      <div className="summary-metrics-bar summary-metrics-bar-6">
        <div className={`metric ${activeFilters.activityType === "all" ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setDraftFilters(p => ({ ...p, activityType: "all" })); setActiveFilters(p => ({ ...p, activityType: "all" })); setPage(1); }}>
          <span>Total Activity Logs</span>
          <strong>{summary.total}</strong>
        </div>
        <div className={`metric ${activeFilters.activityType === "sync" ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setDraftFilters(p => ({ ...p, activityType: "sync" })); setActiveFilters(p => ({ ...p, activityType: "sync" })); setPage(1); }}>
          <span>Sync Activities</span>
          <strong>{summary.sync_count}</strong>
        </div>
        <div className={`metric ${activeFilters.activityType === "issue" ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setDraftFilters(p => ({ ...p, activityType: "issue" })); setActiveFilters(p => ({ ...p, activityType: "issue" })); setPage(1); }}>
          <span>Issue Activities</span>
          <strong>{summary.issue_count}</strong>
        </div>
        <div className={`metric ${activeFilters.activityType === "project" ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setDraftFilters(p => ({ ...p, activityType: "project" })); setActiveFilters(p => ({ ...p, activityType: "project" })); setPage(1); }}>
          <span>Project Activities</span>
          <strong>{summary.project_count}</strong>
        </div>
        <div className={`metric ${activeFilters.activityType === "master_data" ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setDraftFilters(p => ({ ...p, activityType: "master_data" })); setActiveFilters(p => ({ ...p, activityType: "master_data" })); setPage(1); }}>
          <span>Master Data Logs</span>
          <strong>{summary.master_data_count}</strong>
        </div>
        <div className={`metric ${activeFilters.activityType === "auth" ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setDraftFilters(p => ({ ...p, activityType: "auth" })); setActiveFilters(p => ({ ...p, activityType: "auth" })); setPage(1); }}>
          <span>Auth & Login Logs</span>
          <strong>{summary.auth_count}</strong>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: "220px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#475569" }}>Search</label>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input
                type="text"
                placeholder="Search keyword, username, action..."
                value={draftFilters.q}
                onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleApplyFilter()}
                style={{ padding: "8px 12px 8px 32px", width: "100%", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              />
            </div>
          </div>

          <div style={{ width: "180px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#475569" }}>Category</label>
            <select
              value={draftFilters.activityType}
              onChange={(e) => setDraftFilters({ ...draftFilters, activityType: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            >
              <option value="all">All Categories</option>
              <option value="sync">Sync (SAP CR)</option>
              <option value="issue">Issue (Create/Change/Delete)</option>
              <option value="project">Project (Create/Change/Delete)</option>
              <option value="master_data">Master Data & User</option>
              <option value="setting">Setting & App Config</option>
              <option value="auth">Authentication (Login/Logout)</option>
            </select>
          </div>

          <div style={{ width: "150px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#475569" }}>From Date</label>
            <input
              type="date"
              value={draftFilters.fromDate}
              onChange={(e) => setDraftFilters({ ...draftFilters, fromDate: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            />
          </div>

          <div style={{ width: "150px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "#475569" }}>To Date</label>
            <input
              type="date"
              value={draftFilters.toDate}
              onChange={(e) => setDraftFilters({ ...draftFilters, toDate: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button className="primary" onClick={handleApplyFilter} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Filter size={14} /> Filter
            </button>
            <button className="secondary" onClick={handleResetFilter}>
              Reset
            </button>
          </div>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", border: "1px solid #fecaca", fontSize: "14px" }}>
          {error}
        </div>
      )}

      {/* Log Data Table */}
      <section className="panel table-panel" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "400px" }}>
        <div className="table-scroll" style={{ flex: 1, overflow: "auto" }}>
          <table className="report-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1, borderBottom: "1px solid #e2e8f0" }}>
              <tr>
                <th style={{ padding: "10px 14px", textAlign: "left", width: "170px" }}>DATE & TIME</th>
                <th style={{ padding: "10px 14px", textAlign: "left", width: "130px" }}>CATEGORY</th>
                <th style={{ padding: "10px 14px", textAlign: "left", width: "140px" }}>ACTION</th>
                <th style={{ padding: "10px 14px", textAlign: "left", width: "150px" }}>USERNAME</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>ACTIVITY DESCRIPTION</th>
                <th style={{ padding: "10px 14px", textAlign: "left", width: "120px" }}>IP ADDRESS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: "40px 0", textAlign: "center", color: "#0f766e" }}>
                    <RefreshCw className="animate-spin" size={22} style={{ margin: "0 auto 8px" }} />
                    <div>Loading activity logs...</div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                    No activity logs match the selected filter.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#475569", fontWeight: "500" }}>
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>{getActivityBadge(log.activity_type)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: "600", color: "#334155" }}>
                      <code>{log.action}</code>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontWeight: "600", color: "#0f766e" }}>
                        <User size={13} /> {log.username}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#1e293b" }}>{log.description}</td>
                    <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{log.ip_address || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            Showing <strong>{logs.length}</strong> of <strong>{totalCount}</strong> activity logs
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              &laquo; Prev
            </button>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#334155" }}>
              Page {page} of {totalPages}
            </span>
            <button
              className="secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              Next &raquo;
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
