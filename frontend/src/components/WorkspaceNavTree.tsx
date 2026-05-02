import { useState, type ReactNode } from "react";
import type { InternalProfile } from "../lib/authProfile";
import type { ChatMessage, ConversationSummary } from "../lib/chat";
import { WORKSPACE_TAB_DEFS, type SidebarPrimaryTabId } from "./workspaceNavConstants";
import { WorkspaceNavIcon } from "./workspaceNavIcons";

export type WorkspaceNavTreeProps = {
  activeTab: SidebarPrimaryTabId;
  onSelectTab: (tab: SidebarPrimaryTabId) => void;
  messagesBadgeCount: number;
  activeUsers: InternalProfile[];
  groupConversations: ConversationSummary[];
  dmConversationByUserId: Record<string, string>;
  unreadByConversationId: Record<string, number>;
  latestMessageByConversationId: Record<string, ChatMessage>;
  activeConversationId: string | null | undefined;
  onOpenDm: (userId: string) => void;
  onOpenGroup: (conversation: ConversationSummary) => void;
  onViewUpdatesProfile: (userId: string) => void;
  onNewGroup: () => void;
  formatUnreadCount: (count: number) => string;
  renderPresencePetAvatar: (
    profile: InternalProfile | undefined,
    size: "xs" | "sm" | "md" | "lg" | "xl",
    extraClass?: string
  ) => ReactNode;
};

export function WorkspaceNavTree({
  activeTab,
  onSelectTab,
  messagesBadgeCount,
  activeUsers,
  groupConversations,
  dmConversationByUserId,
  unreadByConversationId,
  latestMessageByConversationId,
  activeConversationId,
  onOpenDm,
  onOpenGroup,
  onViewUpdatesProfile,
  onNewGroup,
  formatUnreadCount,
  renderPresencePetAvatar,
}: WorkspaceNavTreeProps) {
  const [messagesOpen, setMessagesOpen] = useState(activeTab === "messages");

  const visibleTabs = WORKSPACE_TAB_DEFS.filter(
    (tab) => tab.id !== "tasks" && tab.id !== "team" && tab.id !== "settings"
  );

  return (
    <nav className="workspace-nav-tree" aria-label="Workspace">
      <ul className="workspace-nav-tree__list">
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === "messages" && messagesBadgeCount > 0;

          if (tab.id === "messages") {
            return (
              <li key={tab.id} className="workspace-nav-tree__branch">
                <div className={`workspace-nav-tree__row${isActive ? " workspace-nav-tree__row--active" : ""}`}>
                  <button
                    type="button"
                    className={`workspace-nav-tree__chevron${messagesOpen ? " workspace-nav-tree__chevron--open" : ""}`}
                    aria-expanded={messagesOpen}
                    aria-label={messagesOpen ? "Collapse Messages" : "Expand Messages"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMessagesOpen((o) => !o);
                    }}
                  />
                  <button
                    type="button"
                    className="workspace-nav-tree__main"
                    onClick={() => {
                      setMessagesOpen(true);
                      onSelectTab("messages");
                    }}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="workspace-nav-tree__icon" aria-hidden>
                      <WorkspaceNavIcon name={tab.icon} />
                    </span>
                    <span className="workspace-nav-tree__label">{tab.label}</span>
                    {showBadge ? <span className="workspace-nav-tree__badge">{formatUnreadCount(messagesBadgeCount)}</span> : null}
                  </button>
                </div>
                {messagesOpen ? (
                  <ul className="workspace-nav-tree__nested">
                    <li className="workspace-nav-tree__nested-heading">Direct messages</li>
                    {activeUsers.map((user) => {
                      const dmConversationId = dmConversationByUserId[user.id];
                      const unreadCount = unreadByConversationId[dmConversationId] ?? 0;
                      const latestMessage = dmConversationId ? latestMessageByConversationId[dmConversationId] : undefined;
                      const preview =
                        latestMessage?.body?.trim() ||
                        (latestMessage?.message_type === "image"
                          ? "Image"
                          : latestMessage?.message_type === "file"
                            ? latestMessage.attachment_name || "File"
                            : "");
                      const isConvActive = activeConversationId === dmConversationId;
                      return (
                        <li key={user.id} className="workspace-nav-tree__nested-dm-row">
                          <button
                            type="button"
                            className={`workspace-nav-tree__nested-btn${isConvActive ? " workspace-nav-tree__nested-btn--active" : ""}`}
                            onClick={() => onOpenDm(user.id)}
                            aria-label={`Open chat with ${user.display_name}`}
                          >
                            <span className="workspace-nav-tree__avatar-hit" aria-hidden>
                              {renderPresencePetAvatar(user, "sm")}
                            </span>
                            <span className="workspace-nav-tree__nested-text">
                              <span className="workspace-nav-tree__nested-name">{user.display_name}</span>
                              <span className="workspace-nav-tree__nested-preview">{preview || "No messages yet"}</span>
                            </span>
                            {unreadCount > 0 ? (
                              <span className="workspace-nav-tree__mini-badge">{formatUnreadCount(unreadCount)}</span>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            className="workspace-nav-tree__nested-dm-updates"
                            onClick={() => onViewUpdatesProfile(user.id)}
                            aria-label={`${user.display_name}: daily updates`}
                            title="Daily updates"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                    <li className="workspace-nav-tree__nested-heading workspace-nav-tree__nested-heading--row">
                      <span>Group chats</span>
                      <button type="button" className="workspace-nav-tree__nested-action" onClick={onNewGroup}>
                        + New
                      </button>
                    </li>
                    {groupConversations.map((group) => {
                      const unreadCount = unreadByConversationId[group.id] ?? 0;
                      const latestMessage = latestMessageByConversationId[group.id];
                      const preview =
                        latestMessage?.body?.trim() ||
                        (latestMessage?.message_type === "image"
                          ? "Image"
                          : latestMessage?.message_type === "file"
                            ? latestMessage.attachment_name || "File"
                            : "");
                      const isConvActive = activeConversationId === group.id;
                      return (
                        <li key={group.id}>
                          <button
                            type="button"
                            className={`workspace-nav-tree__nested-btn${isConvActive ? " workspace-nav-tree__nested-btn--active" : ""}`}
                            onClick={() => onOpenGroup(group)}
                          >
                            <span className="workspace-nav-tree__group-avatar" aria-hidden>
                              {(group.title || "G").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="workspace-nav-tree__nested-text">
                              <span className="workspace-nav-tree__nested-name">{group.title || "Untitled group"}</span>
                              <span className="workspace-nav-tree__nested-preview">{preview || "No messages yet"}</span>
                            </span>
                            {unreadCount > 0 ? (
                              <span className="workspace-nav-tree__mini-badge">{formatUnreadCount(unreadCount)}</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          }

          return (
            <li key={tab.id} className="workspace-nav-tree__branch">
              <div className={`workspace-nav-tree__row workspace-nav-tree__row--leaf${isActive ? " workspace-nav-tree__row--active" : ""}`}>
                <span className="workspace-nav-tree__chevron workspace-nav-tree__chevron--spacer" aria-hidden />
                <button
                  type="button"
                  className="workspace-nav-tree__main"
                  onClick={() => onSelectTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="workspace-nav-tree__icon" aria-hidden>
                    <WorkspaceNavIcon name={tab.icon} />
                  </span>
                  <span className="workspace-nav-tree__label">
                    {tab.label}
                    {tab.sublabel ? <span className="workspace-nav-tree__sublabel">{tab.sublabel}</span> : null}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
