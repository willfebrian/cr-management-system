import { Columns3, Eye } from "lucide-react";

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
    <div className="issue-column-menu" style={{ position: "relative", display: "inline-block" }}>
      <button
        className="secondary column-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        <Columns3 size={16} /> <span>Columns</span>
      </button>
      {open ? (
        <div
          className="issue-column-menu-list"
          role="menu"
          aria-label="Optional Issue columns"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1000,
            width: "200px",
            background: "var(--color-bg-elevated, #ffffff)",
            border: "1px solid var(--color-border, #cbd5e1)",
            borderRadius: "12px",
            boxShadow: "0 12px 28px -6px rgba(15, 23, 42, 0.18)",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}
        >
          <div
            className="column-menu-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 6px 8px 6px",
              borderBottom: "1px solid var(--color-border-soft, #e2e8f0)",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--color-text-muted, #64748b)"
            }}
          >
            <Eye size={13} color="#0f766e" />
            <span>Optional Columns</span>
          </div>
          <div className="column-menu-items" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {OPTIONAL_ISSUE_COLUMNS.map((column) => {
              const isChecked = visibleColumns.includes(column.key);
              return (
                <label
                  key={column.key}
                  className={`column-menu-item ${isChecked ? "active" : ""}`}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: "var(--color-text, #334155)",
                    cursor: "pointer",
                    userSelect: "none",
                    width: "100%",
                    textAlign: "left",
                    margin: 0,
                    background: isChecked ? "var(--color-bg-subtle, #f0fdf4)" : "transparent"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(column.key)}
                    style={{
                      width: "16px",
                      height: "16px",
                      margin: 0,
                      padding: 0,
                      cursor: "pointer",
                      accentColor: "#0f766e",
                      flexShrink: 0
                    }}
                  />
                  <span
                    className="column-menu-label"
                    style={{
                      flex: 1,
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      fontSize: "0.85rem",
                      color: "inherit"
                    }}
                  >
                    {column.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
