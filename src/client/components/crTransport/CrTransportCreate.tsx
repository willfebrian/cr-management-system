import { useMemo, useState, useEffect, useRef, type FormEvent } from "react";
import { AlertTriangle, Check, CheckCircle2, Database, Loader2, PackageCheck, Plus, Search, SearchX, ShieldCheck, Trash2, X } from "lucide-react";
import { UIModal } from "../common/UIModal";
import { createTransportRequest, preflightTransportRequest, resolveTransportObject, type ResolvedTransportObject, type TransportRequestResult } from "../../api/transportRequestApi";
import { TRANSPORT_TARGETS, type TransportTargetSystem, normalizeTransportTarget, transportTargetLabel } from "./transportTarget";
import { fetchSapSystems, type SapSystemRow } from "../../api";

const PREFIX = "AB - ";
const MAX_DESCRIPTION = 55;
const TARGET_SYSTEM_STORAGE_KEY = "cr_transport_target_system";

function cleanPrefix(val?: string) {
  return String(val || "").replace(/^AB\s*-\s*/i, "").trim();
}

function getSapObjectTypeMeta(objectType: string): { label: string; bg: string; color: string } {
  const type = String(objectType || "").trim().toUpperCase();
  switch (type) {
    case "PROG":
      return { label: "Program", bg: "#eff6ff", color: "#1d4ed8" };
    case "TRAN":
      return { label: "T-Code", bg: "#f3e8ff", color: "#6b21a8" };
    case "CLAS":
    case "INTF":
      return { label: "Class", bg: "#ecfdf5", color: "#047857" };
    case "FUGR":
    case "FUNC":
      return { label: "Function Module", bg: "#fffbebe", color: "#b45309" };
    case "TABL":
      return { label: "Table", bg: "#f0fdfa", color: "#0f766e" };
    case "VIEW":
    case "DTEL":
    case "DOMA":
    case "TTYP":
      return { label: "Data Dict", bg: "#f0fdfa", color: "#0f766e" };
    case "DEVC":
      return { label: "Package", bg: "#e0e7ff", color: "#3730a3" };
    case "SSFO":
    case "FORM":
      return { label: "SmartForm", bg: "#ffe4e6", color: "#be123c" };
    default:
      return { label: type || "Object", bg: "#f1f5f9", color: "#475569" };
  }
}

interface CrTransportCreateProps {
  initialDescription?: string;
  targetSystem?: string;
  onTargetSystemChange?: (val: string) => void;
  availableSystems?: SapSystemRow[];
  isModal?: boolean;
  onRequestCreated?: (requestNo: string, taskNo?: string) => void;
}

export function CrTransportCreate({
  initialDescription = "",
  targetSystem: externalTargetSystem,
  onTargetSystemChange,
  availableSystems: externalAvailableSystems,
  isModal = false,
  onRequestCreated
}: CrTransportCreateProps = {}) {
  const [internalTargetSystem, setInternalTargetSystem] = useState<string>(() => {
    try {
      return localStorage.getItem(TARGET_SYSTEM_STORAGE_KEY) || "DEV_NC";
    } catch {
      return "DEV_NC";
    }
  });

  const targetSystem = externalTargetSystem ?? internalTargetSystem;
  const [fetchedSystems, setFetchedSystems] = useState<SapSystemRow[]>([]);
  const availableSystems = externalAvailableSystems ?? fetchedSystems;

  const systemOptions = useMemo(() => {
    if (availableSystems && availableSystems.length > 0) {
      return availableSystems.map((sys) => ({
        code: sys.code,
        label: sys.description || sys.code
      }));
    }
    return TRANSPORT_TARGETS.map((t) => ({ code: t.code, label: t.label }));
  }, [availableSystems]);

  const [query, setQuery] = useState("");
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [results, setResults] = useState<ResolvedTransportObject[]>([]);
  const [objects, setObjects] = useState<ResolvedTransportObject[]>([]);
  const [description, setDescription] = useState(() => cleanPrefix(initialDescription).slice(0, MAX_DESCRIPTION));
  const [busy, setBusy] = useState<"resolve" | "preflight" | "create" | "">("");
  const [error, setError] = useState("");
  const [preflight, setPreflight] = useState<TransportRequestResult | null>(null);
  const [created, setCreated] = useState<TransportRequestResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const resolveRequestRef = useRef(0);
  const fullDescription = `${PREFIX}${description.trim()}`;
  const selectedKeys = useMemo(() => new Set(objects.map(objectKey)), [objects]);
  const canPreflight = objects.length > 0 && description.trim().length > 0 && !busy && !created?.ok;

  useEffect(() => {
    if (initialDescription) {
      setDescription(cleanPrefix(initialDescription).slice(0, MAX_DESCRIPTION));
    }
  }, [initialDescription]);

  useEffect(() => {
    if (externalAvailableSystems) return;
    fetchSapSystems()
      .then((res) => {
        if (res.rows && res.rows.length > 0) {
          const active = res.rows.filter((s) => s.is_active);
          const systemsToUse = active.length > 0 ? active : res.rows;
          setFetchedSystems(systemsToUse);

          if (!externalTargetSystem) {
            setInternalTargetSystem((prev) => {
              if (systemsToUse.some((s) => s.code === prev)) return prev;
              const fallback = systemsToUse[0].code;
              try { localStorage.setItem(TARGET_SYSTEM_STORAGE_KEY, fallback); } catch {}
              return fallback;
            });
          }
        }
      })
      .catch(() => {});
  }, [externalAvailableSystems, externalTargetSystem]);

  function invalidatePreflight() { setPreflight(null); setCreated(null); setConfirmError(""); }

  function startNewRequest() {
    setQuery(""); setResolvedQuery(""); setResults([]); setObjects([]); setDescription("");
    setPreflight(null); setCreated(null); setError(""); setConfirmError(""); setConfirmOpen(false);
  }

  function changeTarget(value: string) {
    if (onTargetSystemChange) {
      onTargetSystemChange(value);
    } else {
      setInternalTargetSystem(value);
    }
    try {
      localStorage.setItem(TARGET_SYSTEM_STORAGE_KEY, value);
    } catch {}
    setQuery(""); setResolvedQuery(""); setResults([]); setObjects([]);
    setPreflight(null); setCreated(null); setError(""); setConfirmError(""); setConfirmOpen(false);
  }

  async function runResolve(event?: FormEvent | React.SyntheticEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    const value = query.trim();
    if (value.length < 3) { setResults([]); setResolvedQuery(""); return; }
    setBusy("resolve"); setError(""); setResults([]);
    try {
      const response = await resolveTransportObject(value, targetSystem);
      setResolvedQuery(value.toUpperCase()); setResults(response.rows || []);
      if (!response.rows?.length) setError(`SAP object was not found in ${transportTargetLabel(targetSystem)}.`);
    } catch (err) { setResolvedQuery(value.toUpperCase()); setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(""); }
  }

  function updateQuery(value: string) {
    setQuery(value);
    if (!value.trim() || value.trim().toUpperCase() !== resolvedQuery) { setResults([]); setResolvedQuery(""); }
  }

  function addObject(item: ResolvedTransportObject) {
    if (selectedKeys.has(objectKey(item))) return;
    setObjects((current) => [...current, item]); invalidatePreflight();
  }

  async function runPreflight() {
    setBusy("preflight"); setError(""); setPreflight(null); setCreated(null);
    try { setPreflight(await preflightTransportRequest(fullDescription, objects, targetSystem)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(""); }
  }

  async function runCreate() {
    setBusy("create"); setError(""); setConfirmError("");
    try {
      const response = await createTransportRequest(fullDescription, objects, targetSystem);
      setCreated(response); setPreflight(null); setConfirmOpen(false);
      if (response.ok && response.request && onRequestCreated) {
        onRequestCreated(response.request, response.task);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message); setConfirmError(message);
    } finally { setBusy(""); }
  }

  return <div className="cr-create-workspace">
    {created?.ok ? <section className="cr-create-success card"><CheckCircle2 size={24} /><div><span className="eyebrow">REQUEST CREATED</span><h3>{created.request}</h3><p>Task {created.task} was created in {transportTargetLabel(targetSystem)} and the selected objects were registered.{created.syncQueued ? " CR sync has been queued." : ""}</p></div><button type="button" className="secondary cr-start-new-request" onClick={startNewRequest}><Plus size={16} /> Start New Request</button></section> : null}

    <section className="card cr-create-card">
      <div className="cr-create-section-heading"><div><span className="cr-create-step">1</span><h3>SAP Objects</h3><p>Search by TCode, program, class, function module, table, or another repository object.</p></div><span className="cr-create-count">{objects.length} selected</span></div>
      <div
        className="cr-object-search"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            void runResolve(e);
          }
        }}
      >
        <label>
          <span>SAP Object</span>
          <div className="cr-search-input">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  void runResolve(e);
                }
              }}
              placeholder="Search by technical name or TCode"
            />
          </div>
        </label>
        <button
          type="button"
          className="secondary cr-resolve-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void runResolve(e);
          }}
          disabled={!query.trim() || busy === "resolve"}
        >
          {busy === "resolve" ? <Loader2 className="spin" size={17} /> : <Search size={17} />} Resolve
        </button>
      </div>
      {error ? <div className="cr-search-error-state"><div className="cr-search-error-icon"><SearchX size={20} /></div><div><strong>SAP Object Not Found</strong><p>{friendlyMessage(error)}</p></div></div> : null}
      {results.length ? <div className="cr-resolve-results"><div className="cr-result-caption"><span>Resolved from <strong>{resolvedQuery}</strong> ({results.length} objects)</span><button type="button" className="cr-close-results-btn" onClick={() => setResults([])} title="Close results"><X size={14} /> Close</button></div>{results.map((item) => { const selected = selectedKeys.has(objectKey(item)); const state = getTransportCreateState({ created, selected, locked: item.locked, lockOrder: item.lockOrder }); const typeMeta = getSapObjectTypeMeta(item.objectType); return <div className="cr-result-row" key={objectKey(item)}><div className="cr-object-icon"><PackageCheck size={18} /></div><div className="cr-object-main"><strong>{item.objectName}</strong><div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}><span className="cr-object-type-badge" style={{ background: typeMeta.bg, color: typeMeta.color }}>{typeMeta.label}</span><span style={{ fontSize: "0.725rem", color: "var(--color-text-muted, #64748b)" }}>{item.pgmid} · {item.objectType}</span></div></div><div className="cr-object-package"><span>Package</span><strong>{item.sourcePackage} → ZTRD</strong></div><div className="cr-result-status-action">{state.assigned ? <span className="cr-assigned-badge"><Check size={14} /> Assigned · {state.request}</span> : item.locked ? <span className="cr-lock-warning">Locked: {item.lockOrder}</span> : <button type="button" className={`secondary cr-row-action ${selected ? "is-added" : ""}`} disabled={selected} onClick={() => addObject(item)}>{selected ? <Check size={15} /> : <Plus size={15} />} {selected ? "Added" : "Add"}</button>}</div></div>; })}</div> : null}
      {objects.length ? <div className="cr-selected-list"><h4>Selected transport roots</h4>{objects.map((item) => { const state = getTransportCreateState({ created, selected: true, locked: item.locked, lockOrder: item.lockOrder }); return <div className="cr-selected-row" key={objectKey(item)}><span className="cr-object-type">{item.objectType}</span><div><strong>{item.objectName}</strong><small>{item.pgmid} · {item.sourcePackage} → ZTRD{state.assigned ? ` · Assigned to ${state.request}` : ""}</small></div>{state.assigned ? <span className="cr-assigned-badge">Assigned</span> : <button type="button" aria-label={`Remove ${item.objectName}`} onClick={() => { setObjects((current) => current.filter((row) => objectKey(row) !== objectKey(item))); invalidatePreflight(); }}><Trash2 size={16} /></button>}</div>; })}</div> : <div className="cr-empty-selection">No SAP objects selected.</div>}
    </section>

    <section className="card cr-create-card"><div className="cr-create-section-heading"><div><span className="cr-create-step">2</span><h3>Request Details</h3><p>The “AB - ” prefix is applied automatically and cannot be removed.</p></div></div><label className="cr-description-label"><span>Request Description</span><div className={`cr-prefix-field ${description.length === MAX_DESCRIPTION ? "at-limit" : ""}`}><span>{PREFIX}</span><input maxLength={MAX_DESCRIPTION} value={description} onChange={(event) => { setDescription(event.target.value); invalidatePreflight(); }} placeholder="Describe the requested change" /></div><small className={description.length === MAX_DESCRIPTION ? "limit" : ""}>{description.length}/{MAX_DESCRIPTION} characters{description.length === MAX_DESCRIPTION ? " · Maximum reached" : ""}</small></label></section>

    <section className="card cr-create-card cr-create-actions"><div><span className="cr-create-step">3</span><h3>Preflight & Create</h3><p>Preflight checks the package, namespace, CTS lock, target, and authorization before creating the request.</p></div>{created?.ok ? <div className="cr-preflight-ok"><CheckCircle2 size={18} /><span><strong>CR already created</strong><small>Selected objects are assigned to {created.request}.</small></span></div> : preflight?.ok ? <div className="cr-preflight-ok"><CheckCircle2 size={18} /><span><strong>Ready to create</strong><small>All selected objects passed the {transportTargetLabel(targetSystem)} checks.</small></span></div> : null}<div className="cr-create-buttons"><button type="button" className="secondary" disabled={!canPreflight} onClick={runPreflight}>{busy === "preflight" ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />} Run Preflight</button><button type="button" className="primary" disabled={!preflight?.ok || Boolean(busy) || Boolean(created?.ok)} onClick={() => { setConfirmError(""); setConfirmOpen(true); }}><PackageCheck size={17} /> {created?.ok ? "CR already created" : "Create SAP CR"}</button></div></section>

    <UIModal isOpen={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Create SAP transport request?" subtitle={`This action changes CTS ${transportTargetLabel(targetSystem)} and is not a preview.`} type="warning" confirmText="Create Request" confirmLoading={busy === "create"} onConfirm={runCreate}><div className="cr-confirm-summary"><div><span>Request Description</span><strong>{fullDescription}</strong></div><div><span>Objects</span><strong>{objects.length} transport root(s)</strong></div><div><span>Target</span><strong>{transportTargetLabel(targetSystem)} · ZTRD · TRSTDEV</strong></div></div>{confirmError ? <div className="cr-confirm-error"><AlertTriangle size={16} /> {friendlyMessage(confirmError)}</div> : null}</UIModal>
  </div>;
}

function objectKey(item: ResolvedTransportObject) { return `${item.pgmid}:${item.objectType}:${item.objectName}`; }
function friendlyMessage(value: string) { return value.replace(/^Transport request denied:\s*/i, "").replaceAll("_", " "); }

export function getTransportCreateState({ created, selected = false, locked = false, lockOrder = "" }: {
  created: TransportRequestResult | null;
  selected?: boolean;
  locked?: boolean;
  lockOrder?: string;
}) {
  const createdRequest = created?.ok && selected ? String(created.request || "").trim() : "";
  const request = createdRequest || (locked ? String(lockOrder || "").trim() : "");
  const assigned = Boolean(request);
  return { assigned, request, canCreate: !assigned, createLabel: assigned ? "CR already created" : "Create SAP CR" };
}
