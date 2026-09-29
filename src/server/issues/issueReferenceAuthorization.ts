import type { AuthUser } from "../auth/authService.js";
import type { IssueSavePayload } from "../db/issueRepository.js";

type ReferenceField = "crLinks" | "glpiTickets" | "crHelpdeskNumbers";
export type IssueReferenceSets = Record<ReferenceField, string[]>;

export class PermissionDeniedError extends Error {
  readonly status = 403;
  readonly code = "PERMISSION_DENIED";
  constructor() {
    super("You do not have permission to change this Issue reference.");
    this.name = "PermissionDeniedError";
  }
}

function normalized(field: ReferenceField, value: string | undefined): string[] {
  const parts = (value || "").split(/[;,]/).map((part) => part.trim()).filter(Boolean);
  const values = parts.map((part) => field === "glpiTickets"
    ? String(Number(part.replace(/[^\d]/g, "")))
    : part.toUpperCase());
  return [...new Set(values.filter((part) => part !== "0" && part !== "NaN"))].sort();
}

export function assertIssueReferenceChangesAllowed(
  payload: Pick<IssueSavePayload, ReferenceField>,
  stored: IssueReferenceSets,
  actor: AuthUser
): void {
  const rules = [
    ["crLinks", "issue.cr_references", true],
    ["glpiTickets", "issue.glpi_references", true],
    ["crHelpdeskNumbers", "issue.helpdesk_references", false]
  ] as const;
  for (const [field, permission, adminOnly] of rules) {
    if (payload[field] === undefined) continue;
    const before = normalized(field, stored[field].join(";"));
    const after = normalized(field, payload[field]);
    if (before.length === after.length && before.every((item, index) => item === after[index])) continue;
    if ((adminOnly && actor.role !== "ADMIN") || !actor.permissions.includes(permission)) {
      throw new PermissionDeniedError();
    }
  }
}
