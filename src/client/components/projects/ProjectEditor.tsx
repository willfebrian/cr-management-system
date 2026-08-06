import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { UIModal } from "../common/UIModal.js";
import type {
  EditableProjectStatus,
  ProjectDetail,
  ProjectIssueOption,
  ProjectOwnerOption,
  ProjectSavePayload
} from "../../../shared/projectTypes.js";
import {
  fetchProjectIssueOptions,
  fetchProjectOwnerOptions,
  saveProject
} from "../../api/projectApi.js";
import {
  addProjectIssueSelection,
  ProjectIssuePicker,
  removeProjectIssueSelection
} from "./ProjectIssuePicker.js";

export type ProjectDraft = ProjectSavePayload & { description: string };

export function createInitialProjectDraft(detail?: ProjectDetail): ProjectDraft {
  if (!detail) {
    return {
      projectName: "",
      description: "",
      ownerPersonId: 0,
      projectStatus: "planned",
      issueIds: []
    };
  }
  return {
    id: detail.project.id,
    projectName: detail.project.projectName,
    description: detail.project.description || "",
    ownerPersonId: detail.project.ownerPersonId,
    projectStatus: detail.project.projectStatus === "cancelled" ? "planned" : detail.project.projectStatus,
    issueIds: detail.issues.flatMap((issue) => issue.issueId ? [issue.issueId] : [])
  };
}

export function validateProjectDraft(draft: ProjectDraft) {
  if (!draft.projectName.trim()) return "Project name is required.";
  if (!Number.isSafeInteger(draft.ownerPersonId) || draft.ownerPersonId <= 0) return "Project owner is required.";
  return null;
}

type ProjectEditorProps = {
  mode: "create" | "change";
  detail?: ProjectDetail;
  onSaved: (detail: ProjectDetail) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function ProjectEditor({ mode, detail, onSaved, onCancel, onDirtyChange }: ProjectEditorProps) {
  const initial = useMemo(() => createInitialProjectDraft(detail), [detail]);
  const [draft, setDraft] = useState(initial);
  const [owners, setOwners] = useState<ProjectOwnerOption[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<ProjectIssueOption[]>(() =>
    detail?.issues.flatMap((issue) => issue.issueId ? [{
      issueId: issue.issueId,
      issueKey: issue.issueKey,
      issueName: issue.issueName,
      issueStatus: issue.issueStatus,
      requesterName: issue.requesterName,
      abaperName: issue.abaperName,
      primaryCr: issue.primaryCr,
      available: true
    }] : []) || []
  );
  const [issueQuery, setIssueQuery] = useState("");
  const [issueOptions, setIssueOptions] = useState<ProjectIssueOption[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const readOnly = detail?.project.projectStatus === "cancelled";

  useEffect(() => {
    fetchProjectOwnerOptions().then((result) => setOwners(result.rows)).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, []);

  useEffect(() => {
    if (!issueQuery.trim() || readOnly) {
      setIssueOptions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoadingIssues(true);
      fetchProjectIssueOptions(issueQuery, detail?.project.id)
        .then((result) => setIssueOptions(result.rows))
        .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
        .finally(() => setLoadingIssues(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [detail?.project.id, issueQuery, readOnly]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  function updateDraft(next: ProjectDraft) {
    setDraft(next);
    setDirty(true);
  }

  function addIssue(issue: ProjectIssueOption) {
    const next = addProjectIssueSelection(selectedIssues, issue);
    setSelectedIssues(next);
    updateDraft({ ...draft, issueIds: next.map((item) => item.issueId) });
  }

  function removeIssue(issueId: number) {
    const next = removeProjectIssueSelection(selectedIssues, issueId);
    setSelectedIssues(next);
    updateDraft({ ...draft, issueIds: next.map((item) => item.issueId) });
  }

  async function submit() {
    const validation = validateProjectDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveProject({ ...draft, issueIds: [...new Set(draft.issueIds)] });
      setDirty(false);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const [showDiscardModal, setShowDiscardModal] = useState(false);

  function leave() {
    if (!dirty) {
      onCancel();
    } else {
      setShowDiscardModal(true);
    }
  }

  return (
    <>
      <ProjectEditorView
        mode={mode}
        draft={draft}
        owners={owners}
        issueOptions={issueOptions}
        selectedIssues={selectedIssues}
        issueQuery={issueQuery}
        saving={saving}
        loadingIssues={loadingIssues}
        readOnly={Boolean(readOnly)}
        error={error}
        onDraftChange={updateDraft}
        onIssueQueryChange={setIssueQuery}
        onAddIssue={addIssue}
        onRemoveIssue={removeIssue}
        onSave={submit}
        onCancel={leave}
      />
      <UIModal
        isOpen={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        title="Unsaved Changes"
        subtitle="Unsaved Project changes will be lost. Do you want to proceed?"
        type="warning"
        confirmText="Discard Changes"
        cancelText="Keep Editing"
        onConfirm={() => {
          setShowDiscardModal(false);
          onCancel();
        }}
      />
    </>
  );
}

type ProjectEditorViewProps = {
  mode: "create" | "change";
  draft: ProjectDraft;
  owners: ProjectOwnerOption[];
  issueOptions: ProjectIssueOption[];
  selectedIssues: ProjectIssueOption[];
  issueQuery: string;
  saving: boolean;
  loadingIssues?: boolean;
  readOnly: boolean;
  error?: string;
  onDraftChange: (draft: ProjectDraft) => void;
  onIssueQueryChange: (query: string) => void;
  onAddIssue: (issue: ProjectIssueOption) => void;
  onRemoveIssue: (issueId: number) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function ProjectEditorView(props: ProjectEditorViewProps) {
  const { draft, readOnly } = props;
  const update = <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) =>
    props.onDraftChange({ ...draft, [key]: value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSave();
  };
  return <form className="project-editor" onSubmit={submit}>
    <header className="project-editor-header project-form-card">
      <div>
        <p className="project-eyebrow">{props.mode === "create" ? "Create" : "Change"} Project</p>
        <h2>{props.mode === "create" ? "New Project" : draft.projectName}</h2>
      </div>
      {readOnly && <span className="project-read-only">Cancelled Projects are read-only</span>}
    </header>
    {props.error && <p className="project-error" role="alert">{props.error}</p>}
    <section className="project-form-card" aria-label="Project information">
    <div className="project-form-grid">
      <label className="project-field project-field-wide">
        <span>Project Name</span>
        <input value={draft.projectName} disabled={readOnly} onChange={(event) => update("projectName", event.currentTarget.value)} />
      </label>
      <label className="project-field">
        <span>Project Owner</span>
        <select value={draft.ownerPersonId} disabled={readOnly} onChange={(event) => update("ownerPersonId", Number(event.currentTarget.value))}>
          <option value={0}>Select owner</option>
          {props.owners.map((owner) => <option value={owner.personId} key={owner.personId}>{owner.fullName}</option>)}
        </select>
      </label>
      <label className="project-field">
        <span>Status</span>
        <select value={draft.projectStatus} disabled={readOnly} onChange={(event) => update("projectStatus", event.currentTarget.value as EditableProjectStatus)}>
          <option value="planned">Planned</option>
          <option value="in_progress">In Progress</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label className="project-field project-field-wide">
        <span>Description</span>
        <textarea value={draft.description} disabled={readOnly} rows={4} onChange={(event) => update("description", event.currentTarget.value)} />
      </label>
    </div>
    </section>
    <ProjectIssuePicker
      query={props.issueQuery}
      options={props.issueOptions}
      selected={props.selectedIssues}
      loading={Boolean(props.loadingIssues)}
      readOnly={readOnly}
      onQueryChange={props.onIssueQueryChange}
      onAdd={props.onAddIssue}
      onRemove={props.onRemoveIssue}
    />
    <footer className="project-editor-actions">
      <button className="project-button" type="button" onClick={props.onCancel}>{readOnly ? "Back" : "Cancel"}</button>
      {!readOnly && <button className="project-button project-button--primary" type="submit" disabled={props.saving}>
        <Save size={16} aria-hidden="true" /> {props.saving ? "Saving…" : "Save Project"}
      </button>}
    </footer>
  </form>;
}
