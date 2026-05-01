export type SidebarPrimaryTabId = "home" | "messages" | "tasks" | "timeline" | "team" | "settings";

type SidebarPrimaryNavProps = {
  activeTab: SidebarPrimaryTabId;
  onSelectTab: (tab: SidebarPrimaryTabId) => void;
  messagesBadgeCount: number;
};

const tabDefs: {
  id: SidebarPrimaryTabId;
  label: string;
  sublabel?: string;
  icon: "home" | "messages" | "tasks" | "timeline" | "team" | "settings";
}[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "messages", label: "Messages", icon: "messages" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "timeline", label: "Timeline", icon: "timeline" },
  { id: "team", label: "Team", sublabel: "Pets & Rewards", icon: "team" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function NavIcon({ name }: { name: (typeof tabDefs)[number]["icon"] }) {
  const stroke = "currentColor";
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
          <path d="M9 22V12h6v10" />
        </svg>
      );
    case "messages":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "timeline":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "team":
      return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="8.5" cy="7" r="2" />
          <circle cx="15.5" cy="7" r="2" />
          <circle cx="6.5" cy="13" r="2" />
          <circle cx="17.5" cy="13" r="2" />
          <ellipse cx="12" cy="16.5" rx="4.5" ry="3.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    default:
      return null;
  }
}

export function SidebarPrimaryNav({ activeTab, onSelectTab, messagesBadgeCount }: SidebarPrimaryNavProps) {
  return (
    <nav className="sidebar-primary-nav" aria-label="Workspace">
      <ul className="sidebar-primary-nav__list">
        {tabDefs.map((tab) => {
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === "messages" && messagesBadgeCount > 0;
          return (
            <li key={tab.id}>
              <button
                type="button"
                className={`sidebar-primary-nav__btn${isActive ? " sidebar-primary-nav__btn--active" : ""}`}
                onClick={() => onSelectTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="sidebar-primary-nav__icon" aria-hidden>
                  <NavIcon name={tab.icon} />
                </span>
                <span className="sidebar-primary-nav__text">
                  <span className="sidebar-primary-nav__label">{tab.label}</span>
                  {tab.sublabel ? <span className="sidebar-primary-nav__sublabel">{tab.sublabel}</span> : null}
                </span>
                {showBadge ? (
                  <span className="sidebar-primary-nav__badge">{messagesBadgeCount > 99 ? "99+" : messagesBadgeCount}</span>
                ) : (
                  <span className="sidebar-primary-nav__badge-spacer" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
