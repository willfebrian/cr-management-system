import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { UIModal } from "../common/UIModal";
import { createTransportRequest, preflightTransportRequest, resolveTransportObject, type ResolvedTransportObject, type TransportRequestResult } from "../../api/transportRequestApi";

const PREFIX = "AB - ";
const MAX_DESCRIPTION = 55;

export function CrTransportCreate() {
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
  const fullDescription = `${PREFIX}${description.trim()}`;
  const selectedKeys = useMemo(() => new Set(objects.map(objectKey)), [objects]);
  const canPreflight = objects.length > 0 && description.trim().length > 0 && !busy;

  function invalidatePreflight() { setPreflight(null); setCreated(null); }

  async function runResolve(event?: FormEvent) {
    event?.preventDefault();
    const value = query.trim();
    if (!value) { setResults([]); setResolvedQuery(""); return; }
    setBusy("resolve"); setError(""); setResults([]);
    try {
      const response = await resolveTransportObject(value);
      setResolvedQuery(value.toUpperCase()); setResults(response.rows || []);
      if (!response.rows?.length) setError("SAP object tidak ditemukan di DEV NC.");
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
    try { setPreflight(await preflightTransportRequest(fullDescription, objects)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(""); }
  }

  async function runCreate() {
    setBusy("create"); setError("");
    try { setCreated(await createTransportRequest(fullDescription, objects)); setConfirmOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(""); }
  }

  return <div className="cr-create-workspace">
    <section className="cr-create-intro card"><div><span className="eyebrow">CREATE TRANSPORT REQUEST</span><h2>New SAP CR</h2><p>Resolve object repository, validate CTS readiness, lalu buat Workbench request di DEV NC.</p></div><div className="cr-create-boundary"><ShieldCheck size={18} /><span><strong>Controlled scope</strong><small>DEV NC · TRSTDEV · ZTRD</small></span></div></section>
    {error ? <div className="notice cr-create-notice"><AlertTriangle size={17} /> {friendlyMessage(error)}</div> : null}
    {created?.ok ? <section className="cr-create-success card"><CheckCircle2 size={24} /><div><span className="eyebrow">REQUEST CREATED</span><h3>{created.request}</h3><p>Task {created.task} sudah dibuat dan object terpilih telah diregistrasikan.</p></div></section> : null}

    <section className="card cr-create-card">
      <div className="cr-create-section-heading"><div><span className="cr-create-step">1</span><h3>SAP Objects</h3><p>Masukkan TCode, program, class, function module, table, atau nama repository object lainnya.</p></div><span className="cr-create-count">{objects.length} selected</span></div>
      <form className="cr-object-search" onSubmit={runResolve}><label><span>Object name</span><div className="cr-search-input"><Search size={17} /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Contoh: ZZKMK atau ZFII_MAINTAIN_KMK" /></div></label><button className="secondary cr-resolve-button" disabled={!query.trim() || busy === "resolve"}>{busy === "resolve" ? <Loader2 className="spin" size={17} /> : <Search size={17} />} Resolve</button></form>
      {results.length ? <div className="cr-resolve-results"><div className="cr-result-caption">Resolved from <strong>{resolvedQuery}</strong></div>{results.map((item) => { const selected = selectedKeys.has(objectKey(item)); return <div className="cr-result-row" key={objectKey(item)}><div className="cr-object-icon"><PackageCheck size={18} /></div><div className="cr-object-main"><strong>{item.objectName}</strong><span>{item.pgmid} · {item.objectType}</span></div><div className="cr-object-package"><span>Package</span><strong>{item.sourcePackage} → ZTRD</strong></div>{item.locked ? <span className="cr-lock-warning">Locked: {item.lockOrder}</span> : null}<button type="button" className="secondary cr-row-action" disabled={selected || item.locked} onClick={() => addObject(item)}><Plus size={15} /> {selected ? "Added" : "Add"}</button></div>; })}</div> : null}
      {objects.length ? <div className="cr-selected-list"><h4>Selected transport roots</h4>{objects.map((item) => <div className="cr-selected-row" key={objectKey(item)}><span className="cr-object-type">{item.objectType}</span><div><strong>{item.objectName}</strong><small>{item.pgmid} · {item.sourcePackage} → ZTRD</small></div><button type="button" aria-label={`Remove ${item.objectName}`} onClick={() => { setObjects((current) => current.filter((row) => objectKey(row) !== objectKey(item))); invalidatePreflight(); }}><Trash2 size={16} /></button></div>)}</div> : <div className="cr-empty-selection">Belum ada SAP object yang dipilih.</div>}
    </section>

    <section className="card cr-create-card"><div className="cr-create-section-heading"><div><span className="cr-create-step">2</span><h3>Request Details</h3><p>Prefix dikunci oleh sistem dan tidak dapat dihapus.</p></div></div><label className="cr-description-label"><span>Short Description</span><div className={`cr-prefix-field ${description.length === MAX_DESCRIPTION ? "at-limit" : ""}`}><span>{PREFIX}</span><input maxLength={MAX_DESCRIPTION} value={description} onChange={(event) => { setDescription(event.target.value); invalidatePreflight(); }} placeholder="Update ZZKMK case add new validation" /></div><small className={description.length === MAX_DESCRIPTION ? "limit" : ""}>{description.length}/{MAX_DESCRIPTION} characters{description.length === MAX_DESCRIPTION ? " · Maximum reached" : ""}</small></label></section>

    <section className="card cr-create-card cr-create-actions"><div><span className="cr-create-step">3</span><h3>Preflight & Create</h3><p>Preflight memeriksa package, namespace, lock CTS, target, dan otorisasi sebelum request dibuat.</p></div>{preflight?.ok ? <div className="cr-preflight-ok"><CheckCircle2 size={18} /><span><strong>Ready to create</strong><small>Seluruh object lolos pemeriksaan DEV NC.</small></span></div> : null}<div className="cr-create-buttons"><button type="button" className="secondary" disabled={!canPreflight} onClick={runPreflight}>{busy === "preflight" ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />} Run Preflight</button><button type="button" className="primary" disabled={!preflight?.ok || Boolean(busy)} onClick={() => setConfirmOpen(true)}><PackageCheck size={17} /> Create SAP CR</button></div></section>

    <UIModal isOpen={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Create SAP transport request?" subtitle="Tindakan ini akan mengubah CTS DEV NC dan tidak dapat dianggap sebagai preview." type="warning" confirmText="Create Request" confirmLoading={busy === "create"} onConfirm={runCreate}><div className="cr-confirm-summary"><div><span>Short Description</span><strong>{fullDescription}</strong></div><div><span>Objects</span><strong>{objects.length} transport root(s)</strong></div><div><span>Target</span><strong>DEV NC · ZTRD · TRSTDEV</strong></div></div></UIModal>
  </div>;
}

function objectKey(item: ResolvedTransportObject) { return `${item.pgmid}:${item.objectType}:${item.objectName}`; }
function friendlyMessage(value: string) { return value.replace(/^Transport request denied:\s*/i, "").replaceAll("_", " "); }
