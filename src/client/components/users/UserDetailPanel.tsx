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
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

  return <section className="user-detail" aria-label={`Detail ${user.username}`}>
    <header className="user-detail__header">
      <div>
        <p className="user-detail__eyebrow">User account</p>
        <h2>{user.username}</h2>
      </div>
      <span className={`user-badge user-badge--${user.deletedAt ? "archived" : user.isActive ? "active" : "inactive"}`}>
        {user.deletedAt ? "Archived" : user.isActive ? "Active" : "Inactive"}
      </span>
    </header>

    <dl className="user-detail__summary">
      <div><dt>Role</dt><dd>{user.role}</dd></div>
      <div><dt>User ID</dt><dd>{user.id}</dd></div>
      <div><dt>Password</dt><dd>{user.mustChangePassword ? "Change required" : "Current"}</dd></div>
      <div><dt>Last login</dt><dd>{user.lastLoginAt ?? "Never"}</dd></div>
    </dl>

    <section className="user-detail__person" aria-labelledby="linked-person-title">
      <h3 id="linked-person-title">Linked Person</h3>
      {user.person ? <>
        <dl>
          <div><dt>Full name</dt><dd>{user.person.fullName ?? "-"}</dd></div>
          <div><dt>Nickname</dt><dd>{user.person.nickname ?? "-"}</dd></div>
          <div><dt>Email</dt><dd>{user.person.email ?? "-"}</dd></div>
          <div><dt>Person status</dt><dd>{user.person.isActive ? "Active" : "Inactive"}</dd></div>
        </dl>
        {!user.deletedAt && <div className="user-detail__person-actions">
          <button type="button" className="button" onClick={onChangePerson}>Change Assignment</button>
          <button type="button" className="button button--danger" onClick={onUnassignPerson}>Unassign</button>
        </div>}
      </> : <>
        <p>No person assigned to this account.</p>
        {!user.deletedAt && <button type="button" className="button button--primary" onClick={onAssignPerson}>Assign Person</button>}
      </>}
    </section>

    {user.deletedAt ? <div className="user-detail__archive-context">
      <p><strong>Archived by:</strong> {user.deletedBySnapshot ?? "Unknown"}</p>
      <p><strong>Reason:</strong> {user.deleteReason ?? "—"}</p>
      <button type="button" className="button button--primary" onClick={onRestore}>Restore User</button>
    </div> : <div className="user-detail__actions" aria-label="User actions">
      <button type="button" className="button" onClick={onEdit}>Edit username / role</button>
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
    </div>}

    <section className="user-audit" aria-labelledby="user-audit-title">
      <h3 id="user-audit-title">Audit history</h3>
      {audit.length === 0 ? <p className="user-management__empty">No audit history recorded.</p> :
        <ol className="user-audit__list">
          {audit.map((entry) => <li key={entry.id}>
            <div className="user-audit__heading">
              <strong>{entry.action}</strong>
              <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
            </div>
            <p>Actor: {entry.actorUsername ?? "System"}</p>
            {Object.entries(entry.metadata).length > 0 &&
              <dl>{Object.entries(entry.metadata).map(([key, value]) =>
                <div key={key}><dt>{key}</dt><dd>{auditValue(value)}</dd></div>
              )}</dl>}
          </li>)}
        </ol>}
    </section>
  </section>;
}
