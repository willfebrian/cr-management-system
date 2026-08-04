import { useState } from "react";
import { Ban, ChevronRight, FileOutput, MoreVertical, PencilLine, Trash2, X } from "lucide-react";
import type { ProjectCrReadiness, ProjectCrReadinessItem, ProjectDetail, ProjectRow } from "../../../shared/projectTypes.js";
import type { IncompleteItem, IssueSection } from "../../issueIncomplete.js";
import { cancelProject, deleteProject, downloadProjectCrTransport, fetchProjectCrTransportReadiness } from "../../api/projectApi.js";

type ProjectActionsProps = {
  project: ProjectRow;
  userRole: "ADMIN" | "USER";
  onChange?: () => void;
  onChanged: (detail?: ProjectDetail) => void;
  onOpenIncompleteItem?: (issueId: number, item: IncompleteItem) => void;
};

export function ProjectActions({ project, userRole, onChange, onChanged, onOpenIncompleteItem }: ProjectActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"cancel" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [readiness, setReadiness] = useState<ProjectCrReadiness | null>(null);
  const isCancelled = project.projectStatus === "cancelled";
  const canDelete = userRole === "ADMIN" && project.canDelete;

  async function generateProjectDocument() {
    setBusy(true);
    setError("");
    try {
      const nextReadiness = await fetchProjectCrTransportReadiness(project.id);
      if (!nextReadiness.ready) {
        setReadiness(nextReadiness);
        return;
      }
      const download = await downloadProjectCrTransport(project.id);
      triggerDownload(download.blob, download.filename);
    } catch (caught) {
      const generationError = caught as Error & { readiness?: ProjectCrReadiness };
      if (generationError.readiness) setReadiness(generationError.readiness);
      else setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setBusy(false);
    }
  }

  async function submitCancel() {
    const validation = validateProjectCancelReason(reason);
    if (validation) return setError(validation);
    setBusy(true);
    try {
      onChanged(await cancelProject(project.id, reason.trim()));
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete() {
    if (!canConfirmProjectDelete(confirmation, project.projectKey)) {
      setError(`Type ${project.projectKey} exactly to confirm.`);
      return;
    }
    setBusy(true);
    try {
      await deleteProject(project.id);
      onChanged();
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return <div className="project-actions">
    <div className="detail-action-menu">
      <button
        className="detail-icon-action"
        type="button"
        disabled={busy}
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {menuOpen && <div className="detail-action-menu-list" role="menu">
        {!isCancelled && onChange && <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); onChange(); }}>
          <PencilLine size={15} aria-hidden="true" /> Change Project
        </button>}
        <button role="menuitem" type="button" disabled={busy} onClick={() => { setMenuOpen(false); void generateProjectDocument(); }}>
          <FileOutput size={15} aria-hidden="true" /> {busy ? "Checking data" : "Generate CR Transport"}
        </button>
        {!isCancelled && <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setDialog("cancel"); setError(""); }}>
          <Ban size={15} aria-hidden="true" /> Cancel Project
        </button>}
        {canDelete && <button className="danger-menu-item" role="menuitem" type="button" onClick={() => { setMenuOpen(false); setDialog("delete"); setError(""); }}>
          <Trash2 size={15} aria-hidden="true" /> Delete Project
        </button>}
      </div>}
    </div>
    {isCancelled && !canDelete && <p className="project-read-only">Cancelled Project · read-only</p>}
    {error && !dialog && <p className="project-error" role="alert">{error}</p>}

    {dialog === "cancel" && <div className="project-dialog-backdrop"><div className="project-dialog" role="dialog" aria-modal="true" aria-label="Cancel Project">
      <h3>Cancel {project.projectKey}</h3>
      <p>Cancellation releases active Issue links and preserves them in history.</p>
      <label className="project-field"><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} /></label>
      {error && <p className="project-error" role="alert">{error}</p>}
      <footer><button className="project-button" type="button" onClick={() => setDialog(null)}>Back</button><button className="project-button project-button--primary" type="button" disabled={busy} onClick={submitCancel}>Confirm cancellation</button></footer>
    </div></div>}

    {dialog === "delete" && <div className="project-dialog-backdrop"><div className="project-dialog" role="dialog" aria-modal="true" aria-label="Delete Project">
      <h3>Delete {project.projectKey}</h3>
      <p>This removes the Project, not its Issues or SAP CRs. Type the exact Project key.</p>
      <label className="project-field"><span>{project.projectKey}</span><input value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} /></label>
      {error && <p className="project-error" role="alert">{error}</p>}
      <footer><button className="project-button" type="button" onClick={() => setDialog(null)}>Back</button><button className="project-button project-button--danger" type="button" disabled={busy || !canConfirmProjectDelete(confirmation, project.projectKey)} onClick={submitDelete}>Confirm delete</button></footer>
    </div></div>}

    {readiness && <div className="project-dialog-backdrop">
      <section className="project-dialog project-readiness-dialog" role="dialog" aria-modal="true" aria-labelledby="project-readiness-title">
        <header>
          <div><p className="project-eyebrow">Incomplete items</p><h3 id="project-readiness-title">CR Transport Project belum dapat dibuat</h3></div>
          <button className="project-dialog-close" type="button" aria-label="Close" onClick={() => setReadiness(null)}><X size={18} /></button>
        </header>
        <p><strong>{readiness.missingCount} data wajib belum lengkap.</strong> Lengkapi item berikut, lalu tekan Generate kembali.</p>
        <div className="project-readiness-groups">
          {readiness.groups.map((group) => <section className="project-readiness-card" key={group.section}>
            <h4>{group.title}<span>{group.items.length}</span></h4>
            <div>{group.items.map((item) => {
              const navigable = Boolean(item.issueId && item.targetId && onOpenIncompleteItem);
              const content = <><span><strong>{item.issueKey || item.crSap || project.projectKey}</strong>{item.crSap && item.issueKey ? ` · ${item.crSap}` : ""}<small>{item.label}</small></span>{navigable && <ChevronRight size={16} aria-hidden="true" />}</>;
              return navigable
                ? <button type="button" key={item.id} onClick={() => { setReadiness(null); onOpenIncompleteItem?.(item.issueId!, readinessItemToIncompleteItem(item)); }}>{content}</button>
                : <div className="project-readiness-item" key={item.id}>{content}</div>;
            })}</div>
          </section>)}
        </div>
        <footer><button className="project-button" type="button" onClick={() => setReadiness(null)}>Close</button></footer>
      </section>
    </div>}
  </div>;
}

export function readinessItemToIncompleteItem(item: ProjectCrReadinessItem): IncompleteItem {
  const section: IssueSection = item.section === "qa" || item.section === "prd" ? item.section : "initiation";
  return { id: item.id, label: item.label, section, targetId: item.targetId || "issue-name" };
}

export function validateProjectCancelReason(reason: string) {
  return reason.trim() ? null : "Cancel reason is required.";
}

export function canConfirmProjectDelete(value: string, projectKey: string) {
  return value === projectKey;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
