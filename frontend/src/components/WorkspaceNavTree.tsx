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
                      if (isActive && messagesOpen) {
                        setMessagesOpen(false);
                      } else {
                        setMessagesOpen(true);
                        onSelectTab("messages");
                      }
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
                      const unreadLabel = unreadCount > 0 ? `, ${formatUnreadCount(unreadCount)} unread` : "";
                      return (
                        <li key={user.id} className="workspace-nav-tree__nested-dm-row">
                          <button
                            type="button"
                            className={`workspace-nav-tree__nested-btn${isConvActive ? " workspace-nav-tree__nested-btn--active" : ""}`}
                            onClick={() => onOpenDm(user.id)}
                            aria-label={`Open chat with ${user.display_name}${unreadLabel}`}
                          >
                            <span className="workspace-nav-tree__avatar-wrap">
                              <span className="workspace-nav-tree__avatar-hit" aria-hidden>
                                {renderPresencePetAvatar(user, "sm")}
                              </span>
                            </span>
                            <span className="workspace-nav-tree__nested-text">
                              <span className="workspace-nav-tree__nested-name-row">
                                <span className="workspace-nav-tree__nested-name">{user.display_name}</span>
                                {unreadCount > 0 ? (
                                  <span className="workspace-nav-tree__name-unread" title={`${unreadCount} unread`} aria-hidden>
                                    {formatUnreadCount(unreadCount)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="workspace-nav-tree__nested-preview">{preview || "No messages yet"}</span>
                            </span>
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
                      const groupUnreadLabel = unreadCount > 0 ? `, ${formatUnreadCount(unreadCount)} unread` : "";
                      return (
                        <li key={group.id}>
                          <button
                            type="button"
                            className={`workspace-nav-tree__nested-btn${isConvActive ? " workspace-nav-tree__nested-btn--active" : ""}`}
                            onClick={() => onOpenGroup(group)}
                            aria-label={`Open ${group.title || "group chat"}${groupUnreadLabel}`}
                          >
                            <span className="workspace-nav-tree__avatar-wrap workspace-nav-tree__avatar-wrap--square">
                              <span className="workspace-nav-tree__group-avatar" aria-hidden>
                                {(group.title || "G").slice(0, 1).toUpperCase()}
                              </span>
                            </span>
                            <span className="workspace-nav-tree__nested-text">
                              <span className="workspace-nav-tree__nested-name-row">
                                <span className="workspace-nav-tree__nested-name">{group.title || "Untitled group"}</span>
                                {unreadCount > 0 ? (
                                  <span className="workspace-nav-tree__name-unread" title={`${unreadCount} unread`} aria-hidden>
                                    {formatUnreadCount(unreadCount)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="workspace-nav-tree__nested-preview">{preview || "No messages yet"}</span>
                            </span>
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
