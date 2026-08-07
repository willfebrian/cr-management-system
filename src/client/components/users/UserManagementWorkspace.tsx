import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type {
  ManagedUser,
  ManagedUserListFilters,
  ManagedUserScope,
  UserAuditEntry
} from "../../../shared/userManagementTypes";
import * as defaultApi from "../../api/userManagementApi";
import { ManagedUserApiError } from "../../api/userManagementApi";
import { TableDataLoader } from "../InteractiveLoaders";
import { UserDetailPanel } from "./UserDetailPanel";
import {
  UserEditorDialog,
  type UserEditorMode,
  type UserEditorPayload
} from "./UserEditorDialog";
import { UserActionDialogs, type UserAction } from "./UserActionDialogs";

type FilterState = { q: string; role: string; status: string };

type ViewProps = {
  currentUserId: number;
  scope: ManagedUserScope;
  filters: FilterState;
  users: ManagedUser[];
  selectedUserId: number | null;
  loading: boolean;
  error: string;
  onScopeChange(scope: ManagedUserScope): void;
  onFiltersChange(filters: FilterState): void;
  onSelect(userId: number): void;
  onCreate(): void;
  children?: ReactNode;
};

export function UserManagementWorkspaceView({
  scope,
  filters,
  users,
  selectedUserId,
  loading,
  error,
  onScopeChange,
  onFiltersChange,
  onSelect,
  onCreate,
  children
}: ViewProps) {
  return <section className="user-management" aria-labelledby="user-management-title">
    <div className="user-management__filters">
      <input
        aria-label="Search users"
        placeholder="Search username"
        value={filters.q}
        onChange={(event) => onFiltersChange({ ...filters, q: event.target.value })}
      />
      <select
        aria-label="Filter role"
        value={filters.role}
        onChange={(event) => onFiltersChange({ ...filters, role: event.target.value })}
      >
        <option value="">All roles</option>
        <option value="ADMIN">ADMIN</option>
        <option value="USER">USER</option>
      </select>
      <select
        aria-label="Filter status"
        value={filters.status}
        onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </div>
    {loading && <TableDataLoader text="Loading user accounts..." />}
    {error && <p role="alert" className="user-management__state user-management__state--error">{error}</p>}
    {!loading && !error && users.length === 0 &&
      <p className="user-management__empty">No users found in this scope.</p>}
    <div className="user-management__workspace">
      <div className="user-management__list" role="list" aria-label="Managed users">
        {users.map((user) => <button
          key={user.id}
          type="button"
          role="listitem"
          className={`user-management__row ${selectedUserId === user.id ? "user-management__row--selected" : ""}`}
          aria-pressed={selectedUserId === user.id}
          onClick={() => onSelect(user.id)}
        >
          <span><strong>{user.username}</strong><small>{user.role}</small></span>
          <span className={`user-badge user-badge--${user.deletedAt ? "archived" : user.isActive ? "active" : "inactive"}`}>
            {user.deletedAt ? "Archived" : user.isActive ? "Active" : "Inactive"}
          </span>
        </button>)}
      </div>
      <div className="user-management__detail">{children}</div>
    </div>
  </section>;
}

export function conflictRestoreTarget(error: unknown): number | null {
  if (
    error instanceof ManagedUserApiError &&
    error.status === 409 &&
    error.details.canRestore === true
  ) {
    const id = Number(error.details.archivedUserId);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  return null;
}

type Api = typeof defaultApi;

type Props = {
  currentUser: { id: number; username: string; role: "ADMIN" | "USER" };
  onSessionInvalidated?(): void;
  api?: Api;
};

export function UserManagementWorkspace({
  currentUser,
  onSessionInvalidated,
  api = defaultApi
}: Props) {
  const [scope, setScope] = useState<ManagedUserScope>("current");
  const [filters, setFilters] = useState<FilterState>({ q: "", role: "", status: "" });
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [audit, setAudit] = useState<UserAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ mode: UserEditorMode; user?: ManagedUser | null } | null>(null);
  const [action, setAction] = useState<UserAction | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreConflictId, setRestoreConflictId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.fetchManagedUsers({
        q: filters.q || undefined,
        role: (filters.role || undefined) as ManagedUserListFilters["role"],
        status: (filters.status || undefined) as ManagedUserListFilters["status"],
        scope,
        pageSize: 100
      });
      setUsers(result.users);
      setSelectedUserId((previous) =>
        result.users.some((user) => user.id === previous) ? previous : result.users[0]?.id ?? null
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Gagal memuat user");
      setUsers([]);
      setSelectedUserId(null);
    } finally {
      setLoading(false);
    }
  }, [api, filters, scope]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const activeAdminCount = useMemo(
    () => users.filter((user) => user.role === "ADMIN" && user.isActive && !user.deletedAt).length,
    [users]
  );

  useEffect(() => {
    if (!selectedUser) {
      setAudit([]);
      return;
    }
    let active = true;
    api.fetchManagedUserAudit(selectedUser.id)
      .then((entries) => { if (active) setAudit(entries); })
      .catch(() => { if (active) setAudit([]); });
    return () => { active = false; };
  }, [api, selectedUser]);

  useEffect(() => {
    if (scope !== "archived" || restoreConflictId == null) return;
    const target = users.find((user) => user.id === restoreConflictId);
    if (target) {
      setSelectedUserId(target.id);
      setEditor({ mode: "restore", user: target });
      setRestoreConflictId(null);
    }
  }, [restoreConflictId, scope, users]);

  function closeDialogs() {
    setEditor(null);
    setAction(null);
    setDialogError("");
  }

  async function saveEditor(payload: UserEditorPayload) {
    if (!editor) return;
    setBusy(true);
    setDialogError("");
    try {
      if (editor.mode === "create") {
        await api.createManagedUser(payload as Parameters<Api["createManagedUser"]>[0]);
        setNotice("User berhasil dibuat.");
      } else if (editor.mode === "restore" && editor.user) {
        await api.restoreManagedUser(
          editor.user.id,
          payload as Parameters<Api["restoreManagedUser"]>[1]
        );
        setNotice("User berhasil direstore.");
      } else if (editor.user) {
        const beforeUsername = editor.user.username;
        await api.updateManagedUserProfile(
          editor.user.id,
          payload as Parameters<Api["updateManagedUserProfile"]>[1]
        );
        if (
          editor.user.id === currentUser.id &&
          String((payload as any).username).trim().toUpperCase() !== beforeUsername
        ) {
          onSessionInvalidated?.();
          return;
        }
        setNotice("Profil user diperbarui.");
      }
      closeDialogs();
      await loadUsers();
    } catch (nextError) {
      const archivedId = conflictRestoreTarget(nextError);
      if (archivedId) {
        setRestoreConflictId(archivedId);
        setDialogError("Username dimiliki archived user. Gunakan Restore.");
      } else {
        setDialogError(nextError instanceof Error ? nextError.message : "Operasi gagal");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction(value?: string) {
    if (!action) return;
    setBusy(true);
    setDialogError("");
    try {
      if (action.kind === "status") {
        await api.setManagedUserStatus(action.user.id, !action.user.isActive);
      } else if (action.kind === "reset") {
        await api.resetManagedUserPassword(action.user.id, value ?? "");
      } else if (action.kind === "revoke") {
        await api.revokeManagedUserSessions(action.user.id);
      } else {
        await api.archiveManagedUser(action.user.id, value ?? "");
      }
      setNotice("Aksi user berhasil.");
      closeDialogs();
      await loadUsers();
    } catch (nextError) {
      setDialogError(nextError instanceof Error ? nextError.message : "Operasi gagal");
    } finally {
      setBusy(false);
    }
  }

  function openArchivedRestore() {
    setScope("archived");
    setFilters({ q: "", role: "", status: "" });
  }

  useEffect(() => {
    const handleCreate = () => setEditor({ mode: "create" });
    const handleSetScope = (e: Event) => {
      const customEvent = e as CustomEvent<ManagedUserScope>;
      if (customEvent.detail) {
        setScope(customEvent.detail);
        setFilters({ q: "", role: "", status: "" });
      }
    };
    window.addEventListener("trigger-create-user", handleCreate);
    window.addEventListener("set-user-management-scope", handleSetScope);
    return () => {
      window.removeEventListener("trigger-create-user", handleCreate);
      window.removeEventListener("set-user-management-scope", handleSetScope);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("user-management-scope-changed", { detail: scope }));
  }, [scope]);

  return <>
    {notice && <p role="status" className="user-management__notice">{notice}</p>}
    {restoreConflictId != null && <p role="alert" className="user-management__restore-conflict">
      Username sudah dimiliki archived user.
      <button type="button" className="button" onClick={openArchivedRestore}>Buka Restore</button>
    </p>}
    <UserManagementWorkspaceView
      currentUserId={currentUser.id}
      scope={scope}
      filters={filters}
      users={users}
      selectedUserId={selectedUserId}
      loading={loading}
      error={error}
      onScopeChange={(nextScope) => {
        setScope(nextScope);
        setFilters({ q: "", role: "", status: "" });
      }}
      onFiltersChange={setFilters}
      onSelect={setSelectedUserId}
      onCreate={() => setEditor({ mode: "create" })}
    >
      {selectedUser ? <UserDetailPanel
        user={selectedUser}
        audit={audit}
        currentUserId={currentUser.id}
        activeAdminCount={activeAdminCount}
        onEdit={() => setEditor({ mode: "edit", user: selectedUser })}
        onStatusChange={() => setAction({ kind: "status", user: selectedUser })}
        onResetPassword={() => setAction({ kind: "reset", user: selectedUser })}
        onRevokeSessions={() => setAction({ kind: "revoke", user: selectedUser })}
        onArchive={() => setAction({ kind: "archive", user: selectedUser })}
        onRestore={() => setEditor({ mode: "restore", user: selectedUser })}
      /> : !loading && <p className="user-management__empty">Select a user to view details.</p>}
    </UserManagementWorkspaceView>
    <UserEditorDialog
      open={Boolean(editor)}
      mode={editor?.mode ?? "create"}
      user={editor?.user}
      roleLocked={editor?.mode === "edit" && editor.user?.id === currentUser.id}
      busy={busy}
      error={dialogError}
      onClose={closeDialogs}
      onSubmit={saveEditor}
    />
    <UserActionDialogs
      action={action}
      busy={busy}
      error={dialogError}
      onClose={closeDialogs}
      onConfirm={confirmAction}
    />
  </>;
}
