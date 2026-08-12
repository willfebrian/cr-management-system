import type { ManagedUser, UserAuditEntry } from "../../../shared/userManagementTypes";

type Props = {
  user: ManagedUser;
  audit: UserAuditEntry[];
  currentUserId: number;
  activeAdminCount: number;
  onEdit(): void;
  onStatusChange(): void;
  onResetPassword(): void;
  onRevokeSessions(): void;
  onArchive(): void;
  onRestore(): void;
  onAssignPerson?(): void;
  onChangePerson?(): void;
  onUnassignPerson?(): void;
};

function auditValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatAuditKey(key: string): string {
  const map: Record<string, string> = {
    nextPersonName: "Assigned Person",
    previousPersonName: "Previous Person",
    NEXTPERSONNAME: "Assigned Person",
    PREVIOUSPERSONNAME: "Previous Person",
    nextPersonId: "Person ID",
    previousPersonId: "Prev Person ID",
    NEXTPERSONID: "Person ID",
    PREVIOUSPERSONID: "Prev Person ID",
    role: "Role",
    ROLE: "Role",
    isActive: "Account Status",
    ISACTIVE: "Account Status",
    mustChangePassword: "Must Change Password",
    reason: "Reason",
    username: "Username",
    USERNAME: "Username"
  };
  if (map[key]) return map[key];
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function getActionBadgeStyle(action: string) {
  const normalized = action.toUpperCase();
  if (normalized.includes("ACTIVATED") && !normalized.includes("DEACTIVATED")) {
    return { label: "USER ACTIVATED", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" };
  }
  if (normalized.includes("DEACTIVATED")) {
    return { label: "USER DEACTIVATED", bg: "#fef3c7", color: "#b45309", border: "#fde68a" };
  }
  if (normalized.includes("PASSWORD")) {
    return { label: "PASSWORD RESET", bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" };
  }
  if (normalized.includes("UNASSIGN")) {
    return { label: "PERSON UNASSIGNED", bg: "#ffedd5", color: "#c2410c", border: "#fed7aa" };
  }
  if (normalized.includes("ASSIGN")) {
    return { label: "PERSON ASSIGNED", bg: "#f3e8ff", color: "#7e22ce", border: "#e9d5ff" };
  }
  if (normalized.includes("ARCHIVE") || normalized.includes("DELETE")) {
    return { label: "USER ARCHIVED", bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" };
  }
  if (normalized.includes("CREATE")) {
    return { label: "USER CREATED", bg: "#e0f2fe", color: "#0369a1", border: "#bae6fd" };
  }
  return {
    label: action.replace(/_/g, " "),
    bg: "#f1f5f9",
    color: "#334155",
    border: "#cbd5e1"
  };
}

function renderAuditMetadata(metadata: Record<string, unknown>) {
  if (!metadata || typeof metadata !== "object") return null;

  // Exclude actorUsername
  let entries = Object.entries(metadata).filter(([key]) => key !== "actorUsername");
  if (entries.length === 0) return null;

  // Hide raw person IDs if person names are available to prevent redundant clutter
  const hasNextName = entries.some(([k]) => k.toLowerCase().includes("nextpersonname"));
  const hasPrevName = entries.some(([k]) => k.toLowerCase().includes("previouspersonname"));
  if (hasNextName || hasPrevName) {
    entries = entries.filter(([k]) => !k.toLowerCase().includes("personid"));
  }

  const hasBefore = "before" in metadata;
  const hasAfter = "after" in metadata;

  if (hasBefore && hasAfter) {
    const beforeVal = auditValue(metadata.before);
    const afterVal = auditValue(metadata.after);
    const otherEntries = entries.filter(([key]) => key !== "before" && key !== "after");

    return (
      <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", flexWrap: "wrap" }}>
          <span style={{ color: "var(--color-text-muted, #64748b)", fontWeight: "600" }}>State Change:</span>
          <span style={{ padding: "3px 8px", borderRadius: "4px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontSize: "0.75rem", fontWeight: "600" }}>
            BEFORE: {beforeVal}
          </span>
          <span style={{ color: "var(--color-text-muted, #94a3b8)", fontWeight: "700" }}>→</span>
          <span style={{ padding: "3px 8px", borderRadius: "4px", background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", fontSize: "0.75rem", fontWeight: "600" }}>
            AFTER: {afterVal}
          </span>
        </div>
        {otherEntries.map(([key, value]) => (
          <div key={key} style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>
            <strong>{formatAuditKey(key)}:</strong> {auditValue(value)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {entries.map(([key, value]) => {
        const displayVal = auditValue(value);
        if (displayVal === "—") return null;
        return (
          <div key={key} style={{ fontSize: "0.8rem", display: "flex", gap: "6px", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "4px 10px", borderRadius: "6px" }}>
            <span style={{ color: "#64748b", fontWeight: "600" }}>{formatAuditKey(key)}:</span>
            <span style={{ color: "#0f172a", fontWeight: "600" }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

export function UserDetailPanel({
  user,
  audit,
  currentUserId,
  activeAdminCount,
  onEdit,
  onStatusChange,
  onResetPassword,
  onRevokeSessions,
  onArchive,
  onRestore,
  onAssignPerson,
  onChangePerson,
  onUnassignPerson
}: Props) {
  const isSelf = user.id === currentUserId;
  const isFinalActiveAdmin =
    user.role === "ADMIN" && user.isActive && activeAdminCount <= 1;
  const statusProtected = user.isActive && (isSelf || isFinalActiveAdmin);
  const archiveProtected = isSelf || isFinalActiveAdmin;
  const statusReason = isSelf
    ? "Cannot deactivate own account"
    : isFinalActiveAdmin
      ? "Last active administrator must be preserved"
      : "";
  const archiveReason = isSelf
    ? "Cannot archive own account"
    : isFinalActiveAdmin
      ? "Last active administrator must be preserved"
      : "";

  return (
    <section className="user-detail" aria-label="User account details">
      <div className="user-detail__header">
        <div>
          <p className="user-detail__kicker">USER ACCOUNT</p>
          <h2>{user.username}</h2>
        </div>
        <span className={`user-badge user-badge--${user.deletedAt ? "archived" : user.isActive ? "active" : "inactive"}`}>
          {user.deletedAt ? "Archived" : user.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="user-detail__summary">
        <div>
          <dt>Role</dt>
          <dd>{user.role}</dd>
        </div>
        <div>
          <dt>User ID</dt>
          <dd>{user.id}</dd>
        </div>
        <div>
          <dt>Password</dt>
          <dd>{user.mustChangePassword ? "Must Change" : "Current"}</dd>
        </div>
        <div>
          <dt>Last Login</dt>
          <dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : "Never"}</dd>
        </div>
      </div>

      <div className="user-detail__person">
        <h3>Linked Person</h3>
        {user.person ? (
          <>
            <dl>
              <div>
                <dt>Full name</dt>
                <dd>{user.person.fullName ?? "—"}</dd>
              </div>
              <div>
                <dt>Nickname</dt>
                <dd>{user.person.nickname || "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.person.email || "—"}</dd>
              </div>
              <div>
                <dt>Person status</dt>
                <dd>{user.person.isActive ? "Active" : "Inactive"}</dd>
              </div>
            </dl>
            <div className="user-detail__person-actions">
              {onChangePerson && (
                <button type="button" className="button" onClick={onChangePerson}>
                  Change Assignment
                </button>
              )}
              {onUnassignPerson && (
                <button
                  type="button"
                  className="button button--danger"
                  onClick={onUnassignPerson}
                >
                  Unassign
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="user-management__empty">No person assigned to this account.</p>
            {onAssignPerson && (
              <button type="button" className="button button--primary" onClick={onAssignPerson}>
                Assign Person
              </button>
            )}
          </>
        )}
      </div>

      {user.deletedAt ? (
        <div className="user-detail__actions">
          <button type="button" className="button button--primary" onClick={onRestore}>
            Restore Account
          </button>
          <p className="user-detail__protection-note">
            Archived accounts cannot perform login.
          </p>
        </div>
      ) : (
        <div className="user-detail__actions">
          <button type="button" className="button" onClick={onEdit}>
            Edit username / role
          </button>
          <button
            type="button"
            className="button"
            disabled={statusProtected}
            title={statusReason}
            onClick={onStatusChange}
          >
            {user.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            type="button"
            className="button"
            disabled={isSelf}
            title={isSelf ? "Use Change Password to update your own credentials" : ""}
            onClick={onResetPassword}
          >
            Reset Password
          </button>
          <button type="button" className="button" onClick={onRevokeSessions}>Force Logout</button>
          <button
            type="button"
            className="button button--danger"
            disabled={archiveProtected}
            title={archiveReason}
            onClick={onArchive}
          >
            Archive
          </button>
          {statusReason && <p className="user-detail__protection-note">{statusReason}</p>}
          {archiveReason && archiveReason !== statusReason &&
            <p className="user-detail__protection-note">{archiveReason}</p>}
        </div>
      )}

      <section className="user-audit" aria-labelledby="user-audit-title">
        <div className="user-audit__header-bar">
          <h3 id="user-audit-title">Audit History</h3>
          <span className="user-audit__count">{audit.length} event(s)</span>
        </div>

        {audit.length === 0 ? (
          <p className="user-management__empty">No audit history recorded for this user.</p>
        ) : (
          <div className="user-audit__timeline">
            {audit.map((entry, idx) => {
              const badge = getActionBadgeStyle(entry.action);
              const actorName = entry.actorUsername ?? (entry.metadata as any)?.actorUsername ?? "System";
              const isLast = idx === audit.length - 1;

              return (
                <div key={entry.id} className="user-audit__item">
                  <div className="user-audit__marker">
                    <div
                      className="user-audit__dot"
                      style={{ background: badge.color, boxShadow: `0 0 0 3px ${badge.bg}` }}
                    />
                    {!isLast && <div className="user-audit__line" />}
                  </div>

                  <div className="user-audit__content">
                    <div className="user-audit__heading">
                      <span
                        className="user-audit__badge"
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          borderColor: badge.border
                        }}
                      >
                        {badge.label}
                      </span>
                      <time dateTime={entry.createdAt} className="user-audit__time">
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>
                    </div>

                    <div className="user-audit__actor">
                      <span>Actor:</span> <strong>{actorName}</strong>
                    </div>

                    {renderAuditMetadata(entry.metadata)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
