import { Columns3 } from "lucide-react";

export const DEFAULT_ISSUE_COLUMNS = [
  "issue",
  "name",
  "abaper",
  "cr",
  "status",
  "completeness"
] as const;

export type IssueColumnKey =
  | (typeof DEFAULT_ISSUE_COLUMNS)[number]
  | "glpi"
  | "crHelpdesk";

export const OPTIONAL_ISSUE_COLUMNS: ReadonlyArray<{ key: IssueColumnKey; label: string }> = [
  { key: "glpi", label: "GLPI" },
  { key: "crHelpdesk", label: "CR Helpdesk" }
];

export function IssueColumnMenu({
  open,
  visibleColumns,
  onOpenChange,
  onToggle
}: {
  open: boolean;
  visibleColumns: readonly IssueColumnKey[];
  onOpenChange: (open: boolean) => void;
  onToggle: (column: IssueColumnKey) => void;
}) {
  return (
    <div className="issue-column-menu">
      <button
        className="secondary column-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        <Columns3 size={16} /> Columns
      </button>
      {open ? (
        <div className="issue-column-menu-list" role="menu" aria-label="Optional Issue columns">
          {OPTIONAL_ISSUE_COLUMNS.map((column) => (
            <label key={column.key}>
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.key)}
                onChange={() => onToggle(column.key)}
              />
              {column.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
