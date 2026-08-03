import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, PencilLine, Plus } from "lucide-react";
import type { ProjectDetail as ProjectDetailModel, ProjectListResult, ProjectStatus } from "../../../shared/projectTypes.js";
import { fetchProjectDetail, fetchProjects } from "../../api/projectApi.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectActions } from "./ProjectActions.js";

export type ProjectReportState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      result: ProjectListResult;
      selectedId?: number;
      detail?: ProjectDetailModel;
      detailLoading?: boolean;
    };

type ProjectReportProps = {
  onCreate?: () => void;
  onChange?: (projectId: number) => void;
  onOpenIssue?: (issueId: number) => void;
  userRole?: "ADMIN" | "USER";
  onDeleted?: () => void;
};

export function ProjectReport(props: ProjectReportProps) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<ProjectReportState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    fetchProjects({ q, status, page, pageSize: 25 })
      .then((result) => {
        if (!active) return;
        if (result.rows.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        const selectedId = result.rows[0]!.id;
        setState({ kind: "ready", result, selectedId, detailLoading: true });
        return fetchProjectDetail(selectedId).then((detail) => {
          if (active) setState({ kind: "ready", result, selectedId, detail });
        });
      })
      .catch((caught) => active && setState({
        kind: "error",
        message: caught instanceof Error ? caught.message : String(caught)
      }));
    return () => { active = false; };
  }, [page, q, refreshToken, status]);

  async function select(projectId: number) {
    if (state.kind !== "ready") return;
    setState({ ...state, selectedId: projectId, detail: undefined, detailLoading: true });
    try {
      const detail = await fetchProjectDetail(projectId);
      setState({ ...state, selectedId: projectId, detail, detailLoading: false });
    } catch (caught) {
      setState({ kind: "error", message: caught instanceof Error ? caught.message : String(caught) });
    }
  }

  return <div className="project-report-shell">
    <header className="project-report-toolbar">
      <div>
        <p className="project-eyebrow">Portfolio</p>
        <h1>Projects</h1>
      </div>
      {props.onCreate && <button className="project-button project-button--primary" type="button" onClick={props.onCreate}>
        <Plus size={16} aria-hidden="true" /> Create Project
      </button>}
    </header>
    <div className="project-report-filters">
      <label className="project-field"><span>Search</span><input value={q} onChange={(event) => { setQ(event.currentTarget.value); setPage(1); }} /></label>
      <label className="project-field"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.currentTarget.value as ProjectStatus | "all"); setPage(1); }}>
        <option value="all">All statuses</option>
        <option value="planned">Planned</option>
        <option value="in_progress">In Progress</option>
        <option value="on_hold">On Hold</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select></label>
    </div>
    <ProjectReportView
      state={state}
      onSelect={select}
      onChange={props.onChange}
      onOpenIssue={props.onOpenIssue}
      userRole={props.userRole}
      onDeleted={() => {
        setRefreshToken((value) => value + 1);
        props.onDeleted?.();
      }}
      onPrevious={() => setPage((value) => Math.max(value - 1, 1))}
      onNext={() => setPage((value) => value + 1)}
    />
  </div>;
}

type ProjectReportViewProps = {
  state: ProjectReportState;
  onSelect?: (projectId: number) => void;
  onChange?: (projectId: number) => void;
  onOpenIssue?: (issueId: number) => void;
  userRole?: "ADMIN" | "USER";
  onDeleted?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

export function ProjectReportView({ state, onSelect, onChange, onOpenIssue, userRole, onDeleted, onPrevious, onNext }: ProjectReportViewProps) {
  if (state.kind === "loading") return <p className="project-state">Loading Projects…</p>;
  if (state.kind === "empty") return <p className="project-state">No Projects found.</p>;
  if (state.kind === "error") return <p className="project-error" role="alert">{state.message}</p>;
  return <div className="project-report-workspace">
    <aside className="project-list" aria-label="Project list">
      {state.result.rows.map((project) => <button
        type="button"
        key={project.id}
        aria-selected={state.selectedId === project.id}
        className={state.selectedId === project.id ? "is-selected" : ""}
        onClick={() => onSelect?.(project.id)}
      >
        <span><strong>{project.projectKey}</strong><small>{project.projectStatus.replace("_", " ")}</small></span>
        <span>{project.projectName}</span>
        <small>{project.ownerName} · {project.issueCount} Issues</small>
      </button>)}
      <footer className="project-pagination">
        <button className="project-button project-button--quiet" type="button" disabled={state.result.page <= 1} onClick={onPrevious}>
          <ChevronLeft size={15} aria-hidden="true" /> Previous
        </button>
        <span>{state.result.page} / {state.result.totalPages}</span>
        <button className="project-button project-button--quiet" type="button" disabled={state.result.page >= state.result.totalPages} onClick={onNext}>
          Next <ChevronRight size={15} aria-hidden="true" />
        </button>
      </footer>
    </aside>
    <main className="project-detail-pane">
      {state.detailLoading && <p className="project-state">Loading Project detail…</p>}
      {state.detail && <>
        <div className="project-detail-controls">
          {state.detail.project.projectStatus !== "cancelled" && onChange && <button
            className="project-button"
            type="button"
            onClick={() => onChange(state.detail!.project.id)}
          ><PencilLine size={15} aria-hidden="true" /> Change Project</button>}
          {userRole && <ProjectActions
            project={state.detail.project}
            userRole={userRole}
            onChanged={(detail) => {
              if (detail) {
                onSelect?.(detail.project.id);
                return;
              }
              onDeleted?.();
            }}
          />}
        </div>
        <ProjectDetail detail={state.detail} onOpenIssue={onOpenIssue} />
      </>}
    </main>
  </div>;
}
