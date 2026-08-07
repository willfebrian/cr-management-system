export type SidebarGroup = "cr-transport" | "issue" | "project";

export function nextExpandedSidebarGroup(
  current: SidebarGroup | null,
  requested: SidebarGroup
): SidebarGroup | null {
  return current === requested ? null : requested;
}
