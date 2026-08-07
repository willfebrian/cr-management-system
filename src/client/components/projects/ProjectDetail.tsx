import type { ReactNode } from "react";
import type { ProjectDetail as ProjectDetailModel } from "../../../shared/projectTypes.js";
import { ChevronRight } from "lucide-react";
import { SummaryStrip } from "../SummaryStrip.js";

type ProjectDetailProps = {
  detail: ProjectDetailModel;
  onOpenIssue?: (issueId: number) => void;
  actions?: ReactNode;
};

export function ProjectDetail({ detail, onOpenIssue, actions }: ProjectDetailProps) {
  const { project } = detail;
  return <article className="project-detail">
    <header className="project-detail-header">
      <div>
        <p className="project-eyebrow">{project.projectKey}</p>
        <h2>{project.projectName}</h2>
        {project.description && <p>{project.description}</p>}
      </div>
      <div className="project-detail-header-actions">
        <span className={`status ${project.projectStatus} project-status-${project.projectStatus}`}>
          {project.projectStatus.replace("_", " ")}
        </span>
        {actions}
      </div>
    </header>
    <SummaryStrip
      className="project-summary-strip"
      items={[
        { label: "Owner", value: project.ownerName },
        { label: "Issues", value: detail.issues.length },
        { label: "Updated by", value: project.updatedBy },
        { label: "Updated", value: formatDate(project.updatedAt) }
      ]}
    />
    {project.cancelledReason && <div className="project-cancel-note">
      <strong>Cancellation reason</strong>
      <p>{project.cancelledReason}</p>
    </div>}
    <section className="project-linked-list" aria-labelledby="project-detail-issues">
      <div className="project-section-heading" style={{ marginBottom: "var(--space-4)" }}>
        <div>
          <h3 id="project-detail-issues">Linked Issues</h3>
          <p>{project.projectStatus === "cancelled"
            ? "Historical relationships preserved at cancellation."
            : "Current active Project relationships."}</p>
        </div>
      </div>
      {detail.issues.length === 0 && <p className="project-muted">No linked Issues.</p>}
      {detail.issues.map((issue) => <div className="project-linked-row" key={issue.historyId || issue.linkId || issue.issueKey}>
        <button
          type="button"
          disabled={!issue.issueId || !onOpenIssue}
          onClick={() => issue.issueId && onOpenIssue?.(issue.issueId)}
        >{issue.issueKey}<ChevronRight size={15} aria-hidden="true" /></button>
        <div>
          <strong>{issue.issueName}</strong>
          <small>{issue.issueStatus || "unknown"}{issue.primaryCr ? ` · ${issue.primaryCr}` : ""}</small>
        </div>
        <span>{issue.relationStatus === "active" ? "Active" : `Historical · ${issue.relationStatus}`}</span>
        {issue.reason && <p>{issue.reason}</p>}
      </div>)}
    </section>
  </article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
