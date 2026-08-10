import { useMemo, useState, useEffect, useRef, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { UIModal } from "../common/UIModal";
import { createTransportRequest, preflightTransportRequest, resolveTransportObject, type ResolvedTransportObject, type TransportRequestResult } from "../../api/transportRequestApi";
import { TRANSPORT_TARGETS, type TransportTargetSystem, normalizeTransportTarget, transportTargetLabel } from "./transportTarget";
import { fetchSapSystems, type SapSystemRow } from "../../api";

const PREFIX = "AB - ";
const MAX_DESCRIPTION = 55;
const TARGET_SYSTEM_STORAGE_KEY = "cr_transport_target_system";

export function CrTransportCreate() {
  const [targetSystem, setTargetSystem] = useState<string>(() => {
    try {
      return localStorage.getItem(TARGET_SYSTEM_STORAGE_KEY) || "DEV_NC";
    } catch {
      return "DEV_NC";
    }
  });
  const [availableSystems, setAvailableSystems] = useState<SapSystemRow[]>([]);
  const [query, setQuery] = useState("");
  const [resolvedQuery, setResolvedQuery] = useState("");
  const [results, setResults] = useState<ResolvedTransportObject[]>([]);
  const [objects, setObjects] = useState<ResolvedTransportObject[]>([]);
  const [description, setDescription] = useState("");
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
    fetchSapSystems()
      .then((res) => {
        if (res.rows && res.rows.length > 0) {
          const active = res.rows.filter((s) => s.is_active);
          const systemsToUse = active.length > 0 ? active : res.rows;
          setAvailableSystems(systemsToUse);

          setTargetSystem((prev) => {
            if (systemsToUse.some((s) => s.code === prev)) return prev;
            const fallback = systemsToUse[0].code;
            try { localStorage.setItem(TARGET_SYSTEM_STORAGE_KEY, fallback); } catch {}
            return fallback;
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3) {
      setResults([]);
      setResolvedQuery("");
      return;
    }
    const requestId = ++resolveRequestRef.current;
    const timer = window.setTimeout(async () => {
      setBusy("resolve"); setError("");
      try {
        const response = await resolveTransportObject(value, targetSystem);
        if (requestId !== resolveRequestRef.current) return;
        setResolvedQuery(value.toUpperCase()); setResults(response.rows || []);
      } catch (err) {
        if (requestId !== resolveRequestRef.current) return;
        setResolvedQuery(value.toUpperCase()); setResults([]); setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (requestId === resolveRequestRef.current) setBusy("");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, targetSystem]);

  function invalidatePreflight() { setPreflight(null); setCreated(null); setConfirmError(""); }

  function startNewRequest() {
    setQuery(""); setResolvedQuery(""); setResults([]); setObjects([]); setDescription("");
    setPreflight(null); setCreated(null); setError(""); setConfirmError(""); setConfirmOpen(false);
  }

  function changeTarget(value: string) {
    setTargetSystem(value);
    try {
      localStorage.setItem(TARGET_SYSTEM_STORAGE_KEY, value);
    } catch {}
    setQuery(""); setResolvedQuery(""); setResults([]); setObjects([]);
    setPreflight(null); setCreated(null); setError(""); setConfirmError(""); setConfirmOpen(false);
  }

  async function runResolve(event?: FormEvent) {
    event?.preventDefault();
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message); setConfirmError(message);
    } finally { setBusy(""); }
  }

  return <div className="cr-create-workspace">
    <section className="cr-create-intro card"><div><span className="eyebrow">CREATE TRANSPORT REQUEST</span><h2>New SAP CR</h2><p>Resolve repository objects, validate CTS readiness, then create a Workbench request in the selected development system.</p></div><div className="cr-create-intro-tools"><label className="cr-target-picker"><span>Target System</span><select value={targetSystem} onChange={(event) => changeTarget(event.target.value)} disabled={Boolean(busy) || Boolean(created?.ok)}>{availableSystems.length > 0 ? availableSystems.map((sys) => <option key={sys.id} value={sys.code}>{sys.description ? `${sys.description} (${sys.code})` : sys.code}</option>) : TRANSPORT_TARGETS.map((target) => <option key={target.code} value={target.code}>{target.label}</option>)}</select></label></div></section>
    {error ? <div className="notice cr-create-notice"><AlertTriangle size={17} /> {friendlyMessage(error)}</div> : null}
    {created?.ok ? <section className="cr-create-success card"><CheckCircle2 size={24} /><div><span className="eyebrow">REQUEST CREATED</span><h3>{created.request}</h3><p>Task {created.task} was created in {transportTargetLabel(targetSystem)} and the selected objects were registered.{created.syncQueued ? " CR sync has been queued." : ""}</p></div><button type="button" className="secondary cr-start-new-request" onClick={startNewRequest}><Plus size={16} /> Start New Request</button></section> : null}

    <section className="card cr-create-card">
      <div className="cr-create-section-heading"><div><span className="cr-create-step">1</span><h3>SAP Objects</h3><p>Search by TCode, program, class, function module, table, or another repository object.</p></div><span className="cr-create-count">{objects.length} selected</span></div>
      <form className="cr-object-search" onSubmit={runResolve}><label><span>SAP Object</span><div className="cr-search-input"><Search size={17} /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search by technical name or TCode" /></div></label><button className="secondary cr-resolve-button" disabled={query.trim().length < 3 || busy === "resolve"}>{busy === "resolve" ? <Loader2 className="spin" size={17} /> : <Search size={17} />} Resolve</button></form>
      {results.length ? <div className="cr-resolve-results"><div className="cr-result-caption">Resolved from <strong>{resolvedQuery}</strong></div>{results.map((item) => { const selected = selectedKeys.has(objectKey(item)); const state = getTransportCreateState({ created, selected, locked: item.locked, lockOrder: item.lockOrder }); return <div className="cr-result-row" key={objectKey(item)}><div className="cr-object-icon"><PackageCheck size={18} /></div><div className="cr-object-main"><strong>{item.objectName}</strong><span>{item.pgmid} · {item.objectType}</span></div><div className="cr-object-package"><span>Package</span><strong>{item.sourcePackage} → ZTRD</strong></div>{state.assigned ? <span className="cr-assigned-badge">Assigned · {state.request}</span> : item.locked ? <span className="cr-lock-warning">Locked: {item.lockOrder}</span> : null}<button type="button" className="secondary cr-row-action" disabled={selected || state.assigned} onClick={() => addObject(item)}><Plus size={15} /> {state.assigned ? "Assigned" : selected ? "Added" : "Add"}</button></div>; })}</div> : null}
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
