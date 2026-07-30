export type SidebarGroup = "issue" | "project";

export function nextExpandedSidebarGroup(
  current: SidebarGroup | null,
  requested: SidebarGroup
): SidebarGroup | null {
  return current === requested ? null : requested;
}
