import type { AuthUser } from "./api";
import { PERMISSION_CATALOG, type PermissionKey } from "../shared/permissions";

export function can(user: AuthUser | null | undefined, key: PermissionKey): boolean {
  if (!user?.permissions?.includes(key)) return false;
  const definition = PERMISSION_CATALOG.find((item) => item.key === key);
  return !(definition && "adminOnly" in definition && definition.adminOnly && user.role !== "ADMIN");
}

export const VIEW_GRANTS: Record<string, PermissionKey[]> = {
  dashboard: ["dashboard.view"],
  report: ["transport.view"],
  "cr-transport-create": ["transport.create"],
  "cr-transport-release": ["transport.release"],
  "issue-display": ["issue.view"],
  "issue-create": ["issue.create"],
  "issue-change": ["issue.edit"],
  "project-report": ["project.view"],
  "project-create": ["project.create"],
  "project-change": ["project.edit"],
  "master-data": ["master_data.view"],
  settings: ["settings.appearance", "settings.general", "settings.ai", "settings.templates", "settings.target_systems"],
  "audit-log": ["audit.view"],
  "user-management": ["users.view"]
};

export function canOpenView(user: AuthUser | null | undefined, view: string): boolean {
  return (VIEW_GRANTS[view] || []).some((key) => can(user, key));
}

export function firstAccessibleView(user: AuthUser | null | undefined): string | null {
  return Object.keys(VIEW_GRANTS).find((view) => canOpenView(user, view)) || null;
}
