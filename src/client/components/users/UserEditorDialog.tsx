import { useEffect, useState, type FormEvent } from "react";
import type {
  CreateManagedUserPayload,
  ManagedUser,
  RestoreManagedUserPayload,
  UpdateManagedUserProfilePayload,
  UserRole
} from "../../../shared/userManagementTypes";

export type UserEditorMode = "create" | "edit" | "restore";
export type UserEditorPayload =
  | CreateManagedUserPayload
  | UpdateManagedUserProfilePayload
  | RestoreManagedUserPayload;

type Props = {
  open: boolean;
  mode: UserEditorMode;
  user?: ManagedUser | null;
  roleLocked?: boolean;
  busy?: boolean;
  error?: string;
  onClose(): void;
  onSubmit(payload: UserEditorPayload): void | Promise<void>;
};

export function UserEditorDialog({
  open,
  mode,
  user,
  roleLocked = false,
  busy = false,
  error = "",
  onClose,
  onSubmit
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setUsername(user?.username ?? "");
    setPassword("");
    setRole(user?.role ?? "USER");
    setIsActive(user?.isActive ?? true);
  }, [open, user, mode]);

  if (!open) return null;
  const title = mode === "create" ? "Create User" : mode === "restore" ? "Restore User" : "Edit User";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "edit") {
      void onSubmit({ username, role });
    } else if (mode === "restore") {
      void onSubmit({ password, role, isActive });
    } else {
      void onSubmit({ username, password, role, isActive });
    }
  }

  return <div className="dialog-backdrop" role="presentation">
    <section className="user-dialog" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
      <header><h2 id="user-editor-title">{title}</h2></header>
      <form onSubmit={submit}>
        {mode !== "restore" && <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus />
        </label>}
        {mode !== "edit" && <label>
          Initial password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            autoFocus={mode === "restore"}
          />
        </label>}
        <label>
          Role
          <select
            value={role}
            disabled={roleLocked}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        {mode !== "edit" && <label className="user-dialog__check">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active after {mode === "restore" ? "restore" : "creation"}
        </label>}
        {error && <p role="alert" className="user-dialog__error">{error}</p>}
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? "Saving…" : title}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
