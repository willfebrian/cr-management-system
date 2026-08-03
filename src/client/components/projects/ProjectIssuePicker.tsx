import type { ProjectIssueOption } from "../../../shared/projectTypes.js";

type ProjectIssuePickerProps = {
  query: string;
  options: ProjectIssueOption[];
  selected: ProjectIssueOption[];
  loading: boolean;
  readOnly: boolean;
  onQueryChange: (query: string) => void;
  onAdd: (issue: ProjectIssueOption) => void;
  onRemove: (issueId: number) => void;
};

export function ProjectIssuePicker({
  query,
  options,
  selected,
  loading,
  readOnly,
  onQueryChange,
  onAdd,
  onRemove
}: ProjectIssuePickerProps) {
  const selectedIds = new Set(selected.map((issue) => issue.issueId));
  return <section className="project-issue-picker" aria-labelledby="project-issues-heading">
    <div className="project-section-heading">
      <div>
        <h3 id="project-issues-heading">Linked Issues</h3>
        <p>Search and stage relationship changes. Issues are not changed or deleted.</p>
      </div>
      <span>{selected.length} selected</span>
    </div>
    {!readOnly && <label className="project-field">
      <span>Search Issues</span>
      <input
        type="search"
        value={query}
        placeholder="Issue key, name, requester, ABAPer, or CR"
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
    </label>}
    {!readOnly && <div className="project-issue-options" aria-live="polite">
      {loading && <p className="project-muted">Searching Issues…</p>}
      {!loading && query && options.length === 0 && <p className="project-muted">No matching Issues.</p>}
      {options.map((issue) => {
        const alreadySelected = selectedIds.has(issue.issueId);
        const disabled = !issue.available || alreadySelected;
        return <div className="project-issue-option" key={issue.issueId}>
          <IssueSummary issue={issue} />
          <button type="button" disabled={disabled} onClick={() => onAdd(issue)}>
            {alreadySelected ? "Added" : "Add"}
          </button>
          {!issue.available && issue.owningProjectKey && <p className="project-conflict">
            Assigned to {issue.owningProjectKey} · {issue.owningProjectName}
          </p>}
        </div>;
      })}
    </div>}
    <div className="project-selected-issues">
      {selected.length === 0 && <p className="project-muted">No Issues selected.</p>}
      {selected.map((issue) => <div className="project-selected-issue" key={issue.issueId}>
        <IssueSummary issue={issue} />
        {!readOnly && <button
          type="button"
          aria-label={`Remove ${issue.issueKey}`}
          onClick={() => onRemove(issue.issueId)}
        >Remove</button>}
      </div>)}
    </div>
  </section>;
}

export function addProjectIssueSelection(
  selected: ProjectIssueOption[],
  issue: ProjectIssueOption
) {
  return selected.some((current) => current.issueId === issue.issueId)
    ? selected
    : [...selected, issue];
}

export function removeProjectIssueSelection(selected: ProjectIssueOption[], issueId: number) {
  return selected.filter((issue) => issue.issueId !== issueId);
}

function IssueSummary({ issue }: { issue: ProjectIssueOption }) {
  return <div className="project-issue-summary">
    <strong>{issue.issueKey}</strong>
    <span>{issue.issueName}</span>
    <small>
      {issue.issueStatus || "unknown"}
      {issue.requesterName ? ` · Requester ${issue.requesterName}` : ""}
      {issue.abaperName ? ` · ABAPer ${issue.abaperName}` : ""}
      {issue.primaryCr ? ` · ${issue.primaryCr}` : ""}
    </small>
  </div>;
}
