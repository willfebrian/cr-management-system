import { ChevronRight } from "lucide-react";
import type { IssueRow } from "../../shared/types";

export type ProjectLinkedIssue = {
  id: string;
  name: string;
  cr: string;
  status: string;
};

export function findIssueByKey(rows: IssueRow[], issueKey: string) {
  const normalizedKey = issueKey.trim().toUpperCase();
  return rows.find((issue) => issue.issue_key.trim().toUpperCase() === normalizedKey);
}

export function ProjectLinkedIssues({
  issues,
  onOpenIssue
}: {
  issues: ProjectLinkedIssue[];
  onOpenIssue: (issueKey: string) => void;
}) {
  return (
    <>
      {issues.map((issue) => (
        <button className="project-issue-row" type="button" key={issue.id} onClick={() => onOpenIssue(issue.id)} aria-label={`Open issue ${issue.id}`}>
          <span className="project-issue-copy">
            <strong>{issue.id}</strong>
            <span>{issue.name}</span>
            <small>{issue.cr}</small>
          </span>
          <span className="project-issue-status">
            {issue.status}
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        </button>
      ))}
    </>
  );
}
