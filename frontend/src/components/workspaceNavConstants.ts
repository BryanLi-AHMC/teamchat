export type SidebarPrimaryTabId = "home" | "messages" | "tasks" | "timeline" | "team" | "settings";

export type WorkspaceTabIconName = "home" | "messages" | "tasks" | "timeline" | "team" | "settings";

export const WORKSPACE_TAB_DEFS: {
  id: SidebarPrimaryTabId;
  label: string;
  sublabel?: string;
  icon: WorkspaceTabIconName;
  expandable: boolean;
}[] = [
  { id: "home", label: "Home", icon: "home", expandable: false },
  { id: "messages", label: "Messages", icon: "messages", expandable: true },
  { id: "tasks", label: "Tasks", icon: "tasks", expandable: false },
  { id: "timeline", label: "Timeline", icon: "timeline", expandable: true },
  { id: "team", label: "Team", sublabel: "Pets & Rewards", icon: "team", expandable: false },
  { id: "settings", label: "Settings", icon: "settings", expandable: false },
];
