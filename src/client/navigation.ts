export type SidebarGroup = "cr-transport" | "issue" | "project";
export type SidebarGroupDestination = "report" | "issue-display" | "project-report";
const SIDEBAR_GROUP_DESTINATIONS: Record<SidebarGroup, SidebarGroupDestination> = {
  "cr-transport": "report",
  issue: "issue-display",
  project: "project-report"
};

export function getSidebarGroupDestination(group: SidebarGroup): SidebarGroupDestination {
  return SIDEBAR_GROUP_DESTINATIONS[group];
}

export function nextExpandedSidebarGroup(
  current: SidebarGroup | null,
  requested: SidebarGroup
): SidebarGroup | null {
  return current === requested ? null : requested;
}
