import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { ProjectDetail as ProjectDetailModel, ProjectListResult, ProjectStatus } from "../../../shared/projectTypes.js";
import { fetchProjectDetail, fetchProjects } from "../../api/projectApi.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectActions } from "./ProjectActions.js";
import type { IncompleteItem } from "../../issueIncomplete.js";
import { TableDataLoader } from "../InteractiveLoaders.js";

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
  q?: string;
  status?: ProjectStatus | "all";
  onCreate?: () => void;
  onChange?: (projectId: number) => void;
  onOpenIssue?: (issueId: number) => void;
  onOpenIncompleteItem?: (issueId: number, item: IncompleteItem) => void;
  userRole?: "ADMIN" | "USER";
  onDeleted?: () => void;
};

export function ProjectReport(props: ProjectReportProps) {
  const [internalQ, setInternalQ] = useState("");
  const [internalStatus, setInternalStatus] = useState<ProjectStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<ProjectReportState>({ kind: "loading" });

  const q = props.q !== undefined ? props.q : internalQ;
  const status = props.status !== undefined ? props.status : internalStatus;

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
    <div className="project-report-filters project-field" style={{ display: "none" }}>
      <span>Status</span><select value={status} onChange={(e) => setInternalStatus(e.target.value as any)}>
        <option value="all">All</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button className="project-button project-button--primary" style={{ display: "none" }}>Create Project</button>
    </div>
    <ProjectReportView
      state={state}
      onSelect={select}
      onChange={props.onChange}
      onOpenIssue={props.onOpenIssue}
      onOpenIncompleteItem={props.onOpenIncompleteItem}
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
  onOpenIncompleteItem?: (issueId: number, item: IncompleteItem) => void;
  userRole?: "ADMIN" | "USER";
  onDeleted?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

export function ProjectReportView({ state, onSelect, onChange, onOpenIssue, onOpenIncompleteItem, userRole, onDeleted, onPrevious, onNext }: ProjectReportViewProps) {
  if (state.kind === "loading") return <TableDataLoader text="Loading Projects..." />;
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
        <span><strong>{project.projectKey}</strong><span className={`status ${project.projectStatus}`}>{project.projectStatus.replace(/_/g, " ")}</span></span>
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
        <ProjectDetail
          detail={state.detail}
          onOpenIssue={onOpenIssue}
          actions={userRole ? <ProjectActions
            project={state.detail.project}
            userRole={userRole}
            onChange={state.detail.project.projectStatus !== "cancelled" && onChange
              ? () => onChange(state.detail!.project.id)
              : undefined}
            onOpenIncompleteItem={onOpenIncompleteItem}
            onChanged={(detail) => {
              if (detail) {
                onSelect?.(detail.project.id);
                return;
              }
              onDeleted?.();
            }}
          /> : undefined}
        />
      </>}
    </main>
  </div>;
}
