import type { UserRole } from "./userManagementTypes";

type PermissionDefinition = {
  key: string;
  label: string;
  group: string;
  adminOnly?: boolean;
  requires?: readonly string[];
};

export const PERMISSION_CATALOG = [
  { key: "dashboard.view", label: "View Dashboard", group: "Dashboard" },
  { key: "transport.view", label: "View Report", group: "CR Transport" },
  { key: "transport.export", label: "Export Report", group: "CR Transport", requires: ["transport.view"] },
  { key: "transport.create", label: "Create Transport", group: "CR Transport" },
  { key: "transport.release", label: "Release Transport", group: "CR Transport" },
  { key: "transport.sync", label: "Run Sync", group: "CR Transport" },
  { key: "issue.view", label: "View Issues", group: "Issue" },
  { key: "issue.export", label: "Export Issues", group: "Issue", requires: ["issue.view"] },
  { key: "issue.create", label: "Create Issue", group: "Issue", requires: ["issue.view"] },
  { key: "issue.edit", label: "Edit Issue", group: "Issue", requires: ["issue.view"] },
  { key: "issue.cr_references", label: "Manage CR SAP References", group: "Issue", adminOnly: true, requires: ["issue.view"] },
  { key: "issue.glpi_references", label: "Manage GLPI References", group: "Issue", adminOnly: true, requires: ["issue.view"] },
  { key: "issue.helpdesk_references", label: "Manage CR Helpdesk Numbers", group: "Issue", requires: ["issue.view"] },
  { key: "issue.cancel_delete", label: "Cancel/Delete Issue", group: "Issue", requires: ["issue.view"] },
  { key: "issue.generate_email", label: "Generate Confirmation Email", group: "Issue", requires: ["issue.view"] },
  { key: "issue.generate_glpi_template", label: "Generate GLPI Ticket Template", group: "Issue", requires: ["issue.view"] },
  { key: "issue.create_glpi_ticket", label: "Open Create Ticket in GLPI", group: "Issue", requires: ["issue.generate_glpi_template"] },
  { key: "issue.generate_cr_transport_form", label: "Generate CR Transport Form", group: "Issue", requires: ["issue.view"] },
  { key: "issue.generate_cr_user_form", label: "Generate CR User Form", group: "Issue", requires: ["issue.view"] },
  { key: "issue.reminder", label: "Send Reminder Email", group: "Issue", requires: ["issue.view"] },
  { key: "project.view", label: "View Projects", group: "Project" },
  { key: "project.create", label: "Create Project", group: "Project", requires: ["project.view"] },
  { key: "project.edit", label: "Edit Project", group: "Project", requires: ["project.view"] },
  { key: "project.cancel_delete", label: "Cancel/Delete Project", group: "Project", requires: ["project.view"] },
  { key: "project.documents", label: "Generate CR Transport Document", group: "Project", requires: ["project.view"] },
  { key: "master_data.view", label: "View Master Data", group: "Master Data" },
  { key: "master_data.people", label: "Manage People", group: "Master Data", requires: ["master_data.view"] },
  { key: "master_data.group_emails", label: "Manage Group Emails", group: "Master Data", requires: ["master_data.view"] },
  { key: "settings.target_systems", label: "Manage Target Systems", group: "Settings" },
  { key: "settings.general", label: "Manage General Settings", group: "Settings" },
  { key: "settings.ai", label: "Manage AI Settings", group: "Settings" },
  { key: "settings.templates", label: "Manage Templates", group: "Settings" },
  { key: "settings.appearance", label: "Manage Personal Appearance", group: "Settings" },
  { key: "audit.view", label: "View Audit Log", group: "Audit" },
  { key: "users.view", label: "View Users", group: "User Management", adminOnly: true },
  { key: "users.manage", label: "Manage Users & Permissions", group: "User Management", adminOnly: true, requires: ["users.view"] }
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

const definitions = new Map<string, PermissionDefinition>(PERMISSION_CATALOG.map((definition) => [definition.key, definition]));

export function normalizePermissions(keys: readonly string[], role: UserRole): PermissionKey[] {
  const selected = new Set<string>();
  const add = (key: string) => {
    const definition = definitions.get(key);
    if (!definition) throw new Error(`Unknown permission: ${key}`);
    if (definition.adminOnly && role !== "ADMIN") throw new Error(`Administrator role required for ${key}`);
    if (selected.has(key)) return;
    selected.add(key);
    for (const dependency of definition.requires || []) add(dependency);
  };
  for (const key of keys) add(key);
  return PERMISSION_CATALOG.filter((definition) => selected.has(definition.key)).map((definition) => definition.key);
}

export function hasPermission(keys: readonly PermissionKey[], key: PermissionKey): boolean {
  return keys.includes(key);
}

const REGULAR_EXCLUDED = new Set<PermissionKey>([
  "transport.create", "transport.release", "transport.sync",
  "issue.cancel_delete", "project.cancel_delete", "master_data.view",
  "master_data.people", "master_data.group_emails", "settings.target_systems",
  "settings.general", "settings.ai", "settings.templates", "users.view", "users.manage"
]);

export const REGULAR_USER_PRESET: PermissionKey[] = normalizePermissions(
  PERMISSION_CATALOG.filter((definition) => !(definition as PermissionDefinition).adminOnly && !REGULAR_EXCLUDED.has(definition.key)).map((definition) => definition.key),
  "USER"
);

export const ADMIN_PRESET: PermissionKey[] = normalizePermissions(
  PERMISSION_CATALOG.filter((definition) => definition.key !== "transport.create" && definition.key !== "transport.release").map((definition) => definition.key),
  "ADMIN"
);
