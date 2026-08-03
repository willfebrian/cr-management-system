import { useState } from "react";
import { Ban, Trash2 } from "lucide-react";
import type { ProjectDetail, ProjectRow } from "../../../shared/projectTypes.js";
import { cancelProject, deleteProject } from "../../api/projectApi.js";

type ProjectActionsProps = {
  project: ProjectRow;
  userRole: "ADMIN" | "USER";
  onChanged: (detail?: ProjectDetail) => void;
};

export function ProjectActions({ project, userRole, onChanged }: ProjectActionsProps) {
  const [dialog, setDialog] = useState<"cancel" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (project.projectStatus === "cancelled") {
    return <p className="project-read-only">Cancelled Project · read-only</p>;
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
    <button className="project-button" type="button" onClick={() => { setDialog("cancel"); setError(""); }}><Ban size={15} aria-hidden="true" /> Cancel Project</button>
    {userRole === "ADMIN" && <button className="project-button project-button--danger" type="button" onClick={() => { setDialog("delete"); setError(""); }}><Trash2 size={15} aria-hidden="true" /> Delete Project</button>}
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
  </div>;
}

export function validateProjectCancelReason(reason: string) {
  return reason.trim() ? null : "Cancel reason is required.";
}

export function canConfirmProjectDelete(value: string, projectKey: string) {
  return value === projectKey;
}
