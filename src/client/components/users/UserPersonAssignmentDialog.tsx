import type {
  ManagedUser,
  ManagedUserPerson,
  ManagedUserPersonOption
} from "../../../shared/userManagementTypes";

export type UserPersonAssignmentDialogProps = {
  open: boolean;
  user: ManagedUser;
  query: string;
  options: ManagedUserPersonOption[];
  selectedPersonId: number | null;
  phase: "select" | "confirm";
  operation: "assign" | "unassign";
  busy: boolean;
  error: string;
  onQueryChange(value: string): void;
  onSelect(personId: number): void;
  onContinue(): void;
  onBack(): void;
  onConfirm(): void;
  onClose(): void;
};

export function managedPersonLabel(person: ManagedUserPerson): string {
  const fullName = person.fullName?.trim() ?? "";
  const nickname = person.nickname?.trim() ?? "";
  if (fullName && nickname) return `${fullName} (${nickname})`;
  return fullName || nickname || `Person #${person.id}`;
}

function optionDisabled(option: ManagedUserPersonOption, user: ManagedUser): boolean {
  if (!option.isActive) return true;
  return option.assignedUser != null && option.assignedUser.id !== user.id;
}

export function UserPersonAssignmentDialog(props: UserPersonAssignmentDialogProps) {
  if (!props.open) return null;
  const selected = props.options.find((option) => option.id === props.selectedPersonId) ?? null;
  const transition = props.operation === "unassign"
    ? `${props.user.person ? managedPersonLabel(props.user.person) : props.user.username} -> Unassigned`
    : props.user.person && selected
      ? `${managedPersonLabel(props.user.person)} -> ${managedPersonLabel(selected)}`
      : selected
        ? `${props.user.username} -> ${managedPersonLabel(selected)}`
        : "Select a person before continuing";

  return <div className="dialog-backdrop" role="presentation">
    <section className="user-dialog user-person-dialog" role="dialog" aria-modal="true" aria-labelledby="person-assignment-title">
      <header><h2 id="person-assignment-title">
        {props.operation === "unassign" ? "Unassign Person" : props.user.person ? "Change Assignment" : "Assign Person"}
      </h2></header>
      {props.phase === "select" ? <>
        <label>
          Search person
          <input
            value={props.query}
            placeholder="Search full name or nickname"
            onChange={(event) => props.onQueryChange(event.target.value)}
            autoFocus
          />
        </label>
        <div className="user-person-options" role="listbox" aria-label="Person options">
          {props.options.length === 0 && <p className="user-management__empty">No people found.</p>}
          {props.options.map((option) => {
            const disabled = optionDisabled(option, props.user);
            const current = option.assignedUser?.id === props.user.id;
            return <button
              key={option.id}
              type="button"
              className={`user-person-option ${props.selectedPersonId === option.id ? "user-person-option--selected" : ""}`}
              disabled={disabled}
              aria-selected={props.selectedPersonId === option.id}
              onClick={() => props.onSelect(option.id)}
            >
              <strong>{managedPersonLabel(option)}</strong>
              <small>{option.email ?? "No email"}</small>
              {!option.isActive && <span>Inactive</span>}
              {option.assignedUser && !current && <span>Assigned to {option.assignedUser.username}</span>}
              {current && <span>Currently linked</span>}
            </button>;
          })}
        </div>
      </> : <div className="user-person-transition">
        <p>Confirm this account identity change:</p>
        <strong>{transition}</strong>
      </div>}
      {props.error && <p role="alert" className="user-dialog__error">{props.error}</p>}
      <footer>
        <button type="button" className="button" disabled={props.busy} onClick={props.phase === "confirm" && props.operation === "assign" ? props.onBack : props.onClose}>
          {props.phase === "confirm" && props.operation === "assign" ? "Back" : "Cancel"}
        </button>
        {props.phase === "select" ? <button type="button" className="button button--primary" disabled={props.selectedPersonId == null || props.busy} onClick={props.onContinue}>Continue</button>
          : <button type="button" className={props.operation === "unassign" ? "button button--danger" : "button button--primary"} disabled={props.busy} onClick={props.onConfirm}>{props.busy ? "Saving..." : "Confirm"}</button>}
      </footer>
    </section>
  </div>;
}
