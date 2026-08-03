import { useEffect, useState, type FormEvent } from "react";
import type { ManagedUser } from "../../../shared/userManagementTypes";

export type UserAction =
  | { kind: "status"; user: ManagedUser }
  | { kind: "reset"; user: ManagedUser }
  | { kind: "revoke"; user: ManagedUser }
  | { kind: "archive"; user: ManagedUser };

type Props = {
  action: UserAction | null;
  busy?: boolean;
  error?: string;
  onClose(): void;
  onConfirm(value?: string): void | Promise<void>;
};

export function UserActionDialogs({
  action,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [action]);
  if (!action) return null;

  const title = action.kind === "status"
    ? `${action.user.isActive ? "Deactivate" : "Activate"} User`
    : action.kind === "reset"
      ? "Reset Password"
      : action.kind === "revoke"
        ? "Force Logout"
        : "Archive User";

  function submit(event: FormEvent) {
    event.preventDefault();
    void onConfirm(value);
  }

  return <div className="dialog-backdrop" role="presentation">
    <section className="user-dialog" role="dialog" aria-modal="true" aria-labelledby="user-action-title">
      <header><h2 id="user-action-title">{title}</h2></header>
      <form onSubmit={submit}>
        <p>Target: <strong>{action.user.username}</strong></p>
        {action.kind === "reset" && <label>
          New initial password
          <input
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            minLength={8}
            required
            autoFocus
          />
        </label>}
        {action.kind === "archive" && <label>
          Archive reason
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            autoFocus
          />
        </label>}
        {action.kind === "status" &&
          <p>This will {action.user.isActive ? "disable login and revoke active sessions" : "allow login again"}.</p>}
        {action.kind === "revoke" && <p>Every active session for this user will be revoked.</p>}
        {error && <p role="alert" className="user-dialog__error">{error}</p>}
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className={`button ${action.kind === "archive" ? "button--danger" : "button--primary"}`}
            disabled={busy}
          >
            {busy ? "Working…" : "Confirm"}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}
