import {
  ChangeEvent,
  type CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { getCurrentInternalProfile, type InternalProfile } from "./lib/authProfile";
import {
  addGroupMembers,
  createGroupConversation,
  dissolveGroup,
  getActiveTeammates,
  getConversationById,
  getConversationMembers,
  getDmConversationMapForUser,
  getGroupConversationsForUser,
  getLatestMessagesByConversationId,
  getMessagesByIds,
  getUnreadMessageCountsByConversationIds,
  getMessagesOlderThan,
  getRecentMessages,
  CHAT_INITIAL_PAGE_SIZE,
  CHAT_OLDER_PAGE_SIZE,
  getOrCreateDmConversation,
  memberReadCursorIncludesMessage,
  removeGroupMember,
  toChatMessageFromSocket,
  compareMessagesForOrdering,
  type ChatMessage,
  type ConversationMember,
  type ConversationSummary,
} from "./lib/chat";
import { createMyUpdate, deleteMyUpdate, fetchUpdatesForUser, userUpdateDisplayAtIso, type UserUpdate } from "./lib/updates";
import { createTypingChannel, subscribeToTeamPresence } from "./lib/presence";
import { awardMyUpdateXp, type UserStats } from "./lib/profileStats";
import {
  disconnectSocketClient,
  emitMessageSendAndWait,
  getResolvedSocketUrl,
  getSocketClient,
  nudgeSocketReconnect,
  probeTeamchatApiHealth,
  SOCKET_READY_WAIT_MS,
  waitForSocketConnection,
} from "./lib/socket";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import TeamHubHome from "./pages/TeamHubHome";
import { PetAvatar } from "./components/PetAvatar";
import { IdentityBar } from "./components/IdentityBar";
import { HubRailWidgets } from "./components/HubRailWidgets";
import { TeamPetDashboard } from "./components/TeamPetDashboard";
import { TimelineWeekCalendar } from "./components/TimelineWeekCalendar";
import { TimelineCalendarTeamRail } from "./components/TimelineCalendarTeamRail";
import { CurrentUserPlayerCard } from "./components/CurrentUserPlayerCard";
import { WorkspaceNavTree } from "./components/WorkspaceNavTree";
import type { SidebarPrimaryTabId } from "./components/workspaceNavConstants";
import { DailyUpdatesSection } from "./components/DailyUpdatesSection";
import { PET_OPTIONS, isValidPetId } from "./constants/pets";
import { getThemeCssVars, readStoredThemeId, TEAMCHAT_SELECTED_THEME_STORAGE_KEY } from "./utils/theme";
import { getAssignedPetIdForUser, resolvePetIdForProfile } from "./utils/petAssignment";
import { getDateKey } from "./utils/timelineDates";
import "./App.css";

const SELECTED_PET_STORAGE_KEY = "teamchat:selectedPetId";
const LEGACY_SELECTED_PET_STORAGE_KEY = "teamchat:selected-pet-id";
function readStoredPetId(): string {
  const fallback = PET_OPTIONS[0]?.id ?? "";
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const next = localStorage.getItem(SELECTED_PET_STORAGE_KEY);
    if (next && isValidPetId(next)) {
      return next;
    }
    const legacy = localStorage.getItem(LEGACY_SELECTED_PET_STORAGE_KEY);
    if (legacy && isValidPetId(legacy)) {
      localStorage.setItem(SELECTED_PET_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

type NewGroupModalProps = {
  users: InternalProfile[];
  availablePetIds: string[];
  isSubmitting: boolean;
  onCancel: () => void;
  onCreate: (title: string, selectedUserIds: string[]) => Promise<void>;
  /** Same CSS vars as `.app-shell` — modals render outside the shell so theme colors must be re-applied */
  shellThemeStyle?: CSSProperties;
};

type GroupInfoModalProps = {
  group: ConversationSummary;
  members: InternalProfile[];
  currentUserId: string;
  availablePetIds: string[];
  canManageGroup: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onOpenAddMembers: () => void;
  onRemoveMember: (member: InternalProfile) => Promise<void>;
  onDissolveGroup: () => Promise<void>;
  shellThemeStyle?: CSSProperties;
};

type AddMembersModalProps = {
  candidates: InternalProfile[];
  availablePetIds: string[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (selectedUserIds: string[]) => Promise<void>;
  shellThemeStyle?: CSSProperties;
};

function NewGroupModal({ users, availablePetIds, isSubmitting, onCancel, onCreate, shellThemeStyle }: NewGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!groupName.trim()) {
      setError("Please provide a group name.");
      return;
    }

    if (selectedMemberIds.length === 0) {
      setError("Select at least one teammate.");
      return;
    }

    try {
      await onCreate(groupName.trim(), selectedMemberIds);
      setGroupName("");
      setSelectedMemberIds([]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create group.");
    }
  };

  const canCreate = groupName.trim().length > 0 && selectedMemberIds.length > 0;

  return (
    <div className="modal-backdrop" style={shellThemeStyle} role="presentation">
      <div
        className="modal-card modal-card--new-group"
        role="dialog"
        aria-modal="true"
        aria-label="Create group chat"
      >
        <div className="modal-content">
          <h3>New Group Chat</h3>
          <form onSubmit={handleSubmit} className="modal-form modal-form--new-group">
            <div className="modal-body">
              <label htmlFor="group-title">Group name</label>
              <input
                id="group-title"
                type="text"
                placeholder="e.g. Product + Engineering"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                maxLength={80}
              />

              <p className="modal-helper">Select team members</p>
              <div className="member-options new-group-modal__member-list">
                {users.map((user) => (
                  <label key={user.id} className="member-option">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(user.id)}
                      onChange={() => {
                        setSelectedMemberIds((prev) =>
                          prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                        );
                      }}
                    />
                    <PetAvatar
                      petId={getAssignedPetIdForUser(user.id, availablePetIds) ?? undefined}
                      label={user.display_name}
                      size="sm"
                      clip="soft"
                    />
                    <span>{user.display_name}</span>
                  </label>
                ))}
              </div>

              <p className="modal-error" role="alert">
                {error}
              </p>
            </div>

            <div className="modal-footer">
              <button type="button" className="ghost-button" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="new-group-modal__create" disabled={isSubmitting || !canCreate}>
                {isSubmitting ? "Creating..." : "Create Group"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AddMembersModal({
  candidates,
  availablePetIds,
  isSubmitting,
  onCancel,
  onConfirm,
  shellThemeStyle,
}: AddMembersModalProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const toggleMember = (userId: string) => {
    setSelectedUserIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (selectedUserIds.length === 0) {
      setError("Select at least one teammate.");
      return;
    }

    try {
      await onConfirm(selectedUserIds);
      setSelectedUserIds([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add members.");
    }
  };

  return (
    <div className="modal-backdrop" style={shellThemeStyle} role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Add group members">
        <h3>Add Members</h3>
        {candidates.length === 0 ? (
          <>
            <p className="modal-helper">Everyone active is already in this group.</p>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={onCancel}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="member-options">
              {candidates.map((user) => (
                <label key={user.id} className="member-option">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleMember(user.id)}
                  />
                  <PetAvatar
                    petId={getAssignedPetIdForUser(user.id, availablePetIds) ?? undefined}
                    label={user.display_name}
                    size="sm"
                    clip="soft"
                  />
                  <span>{user.display_name}</span>
                </label>
              ))}
            </div>
            <p className="modal-error" role="alert">
              {error}
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function GroupInfoModal({
  group,
  members,
  currentUserId,
  availablePetIds,
  canManageGroup,
  isSubmitting,
  onClose,
  onOpenAddMembers,
  onRemoveMember,
  onDissolveGroup,
  shellThemeStyle,
}: GroupInfoModalProps) {
  return (
    <div className="modal-backdrop" style={shellThemeStyle} role="presentation">
      <div className="modal-card modal-card-wide" role="dialog" aria-modal="true" aria-label="Group info">
        <div className="group-info-header">
          <h3>{group.title || "Untitled group"}</h3>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="group-info-members-grid">
          {members.map((member) => (
            <div key={member.id} className="group-info-member-tile">
              <PetAvatar
                petId={getAssignedPetIdForUser(member.id, availablePetIds) ?? undefined}
                label={member.display_name}
                size="md"
                clip="soft"
              />
              <span className="group-info-member-name">{member.display_name}</span>
              {canManageGroup && member.id !== currentUserId ? (
                <button
                  type="button"
                  className="member-remove-button"
                  disabled={isSubmitting}
                  onClick={() => void onRemoveMember(member)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className="group-info-add-tile" onClick={onOpenAddMembers} disabled={isSubmitting}>
            <span className="group-info-add-plus">+</span>
            <span>Add</span>
          </button>
        </div>

        <div className="group-info-footer">
          {canManageGroup ? (
            <button type="button" className="danger-button" disabled={isSubmitting} onClick={() => void onDissolveGroup()}>
              Dissolve Group
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function isGroupedWithPrevious(currentMessage: ChatMessage, previousMessage?: ChatMessage) {
  if (!previousMessage) {
    return false;
  }
  if (currentMessage.sender_id !== previousMessage.sender_id) {
    return false;
  }
  const currentAt = new Date(currentMessage.created_at).getTime();
  const previousAt = new Date(previousMessage.created_at).getTime();
  return currentAt - previousAt <= 5 * 60 * 1000;
}

function hasTimestampGap(currentMessage: ChatMessage, previousMessage?: ChatMessage) {
  if (!previousMessage) {
    return false;
  }
  const currentAt = new Date(currentMessage.created_at).getTime();
  const previousAt = new Date(previousMessage.created_at).getTime();
  return currentAt - previousAt > 10 * 60 * 1000;
}

function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : `${count}`;
}

function toUserStats(profile: InternalProfile): UserStats {
  return {
    userId: profile.id,
    xp: Math.max(0, Number(profile.xp_total ?? 0)),
    points: Math.max(0, Number(profile.points ?? profile.xp_total ?? 0)),
    level: Math.max(1, Number(profile.level ?? 1)),
    streak: Math.max(0, Number(profile.streak ?? 0)),
  };
}

const ATTACHMENT_BUCKET = "teamchat-attachments";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_MIME_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function MainLayout() {
  const navigate = useNavigate();
  const { conversationId: conversationIdFromRoute } = useParams<{ conversationId?: string }>();
  const EMOJIS = ["😀", "😄", "😂", "👍", "🙏", "❤️", "🎉", "✅", "👀", "😭", "😅", "🔥", "💪", "👏", "🚀"];
  const [currentProfile, setCurrentProfile] = useState<InternalProfile | null>(null);
  const [activeUsers, setActiveUsers] = useState<InternalProfile[]>([]);
  const [memberStatsByUserId, setMemberStatsByUserId] = useState<Record<string, UserStats>>({});
  const [groupConversations, setGroupConversations] = useState<ConversationSummary[]>([]);
  const [dmConversationByUserId, setDmConversationByUserId] = useState<Record<string, string>>({});
  const [unreadByConversationId, setUnreadByConversationId] = useState<Record<string, number>>({});
  const [latestMessageByConversationId, setLatestMessageByConversationId] = useState<Record<string, ChatMessage>>({});
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [selectedPetId, setSelectedPetId] = useState<string>(() => readStoredPetId());
  const [selectedThemeColor, setSelectedThemeColor] = useState<string>(() => readStoredThemeId());
  const [typingByConversationId, setTypingByConversationId] = useState<Record<string, Record<string, string>>>({});
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [activeConversationMembers, setActiveConversationMembers] = useState<ConversationMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** Read-cursor message rows not in `messages` (pagination), for comparing last_read to your sends. */
  const [readReceiptCursorById, setReadReceiptCursorById] = useState<Record<string, ChatMessage>>({});
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentUrlByPath, setAttachmentUrlByPath] = useState<Record<string, string>>({});
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [chatError, setChatError] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isGroupActionSubmitting, setIsGroupActionSubmitting] = useState(false);
  const [selectedUpdatesUserId, setSelectedUpdatesUserId] = useState<string | null>(null);
  const [updatesByUserId, setUpdatesByUserId] = useState<Record<string, UserUpdate[]>>({});
  const [expandedDatesByUserId, setExpandedDatesByUserId] = useState<Record<string, Record<string, boolean>>>({});
  const [expandedUpdateIds, setExpandedUpdateIds] = useState<Set<string>>(new Set());
  const [timelineInput, setTimelineInput] = useState("");
  const [timelineError, setTimelineError] = useState("");
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const [levelUpToast, setLevelUpToast] = useState<string | null>(null);
  const [showUpdatesPanel, setShowUpdatesPanel] = useState(false);
  const [showIdentityBar, setShowIdentityBar] = useState(false);
  const [primarySidebarTab, setPrimarySidebarTab] = useState<SidebarPrimaryTabId>("home");
  const [hubDailyExpanded, setHubDailyExpanded] = useState(true);
  const [hideWorkspaceSidebarColumn, setHideWorkspaceSidebarColumn] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  const [timelineCalendarUserId, setTimelineCalendarUserId] = useState<string | null>(null);
  const [calendarReloadToken, setCalendarReloadToken] = useState(0);
  const [restoredConversationId, setRestoredConversationId] = useState<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const hubRailScrollRegionRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const hasCompletedInitialLoadRef = useRef(false);
  const typingChannelRef = useRef<ReturnType<typeof createTypingChannel> | null>(null);
  const typingIdleTimerRef = useRef<number | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocketClient> | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const dmConversationByUserIdRef = useRef(dmConversationByUserId);
  const groupConversationsRef = useRef(groupConversations);
  /** Conversation rooms this socket has joined (for diffing on membership changes). */
  const joinedConversationRoomsRef = useRef<Set<string>>(new Set());
  const socketConnectJoinHandlerRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  /** When true, new messages / layout growth keep the list pinned to the bottom (Messages-style). */
  const stickToBottomRef = useRef(true);
  const pendingScrollRestoreRef = useRef<{ prevHeight: number; prevScrollTop: number } | null>(null);
  const loadingOlderGuardRef = useRef(false);

  activeConversationIdRef.current = activeConversation?.id ?? null;
  dmConversationByUserIdRef.current = dmConversationByUserId;
  groupConversationsRef.current = groupConversations;

  useEffect(() => {
    if (!selectedPetId) {
      return;
    }
    try {
      localStorage.setItem(SELECTED_PET_STORAGE_KEY, selectedPetId);
    } catch {
      /* ignore */
    }
  }, [selectedPetId]);

  useEffect(() => {
    if (!selectedThemeColor) {
      return;
    }
    try {
      localStorage.setItem(TEAMCHAT_SELECTED_THEME_STORAGE_KEY, selectedThemeColor);
    } catch {
      /* ignore */
    }
  }, [selectedThemeColor]);

  useEffect(() => {
    if (activeConversation) {
      setShowIdentityBar(false);
    }
  }, [activeConversation]);

  useEffect(() => {
    if (!showIdentityBar) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowIdentityBar(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [showIdentityBar]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setHideWorkspaceSidebarColumn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!levelUpToast) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setLevelUpToast(null);
    }, 3800);
    return () => window.clearTimeout(timeoutId);
  }, [levelUpToast]);

  useEffect(() => {
    const allProfiles = currentProfile ? [currentProfile, ...activeUsers] : activeUsers;
    if (allProfiles.length === 0) {
      return;
    }
    setMemberStatsByUserId((existing) => {
      const next = { ...existing };
      for (const profile of allProfiles) {
        if (!next[profile.id]) {
          next[profile.id] = toUserStats(profile);
        }
      }
      return next;
    });
  }, [activeUsers, currentProfile]);

  useEffect(() => {
    let isMounted = true;

    const initializeChat = async () => {
      try {
        const profile = await getCurrentInternalProfile();
        if (!isMounted || !profile) {
          return;
        }

        const [teammates, groups, dmConversationMap] = await Promise.all([
          getActiveTeammates(),
          getGroupConversationsForUser(profile.id),
          getDmConversationMapForUser(profile.id),
        ]);

        if (!isMounted) {
          return;
        }

        const teammatesWithoutCurrent = teammates.filter((user) => user.id !== profile.id);
        setCurrentProfile(profile);
        setActiveUsers(teammatesWithoutCurrent);
        setMemberStatsByUserId(() => {
          const next: Record<string, UserStats> = {};
          next[profile.id] = toUserStats(profile);
          for (const teammate of teammatesWithoutCurrent) {
            next[teammate.id] = toUserStats(teammate);
          }
          return next;
        });
        setSelectedUpdatesUserId(profile.id);
        setTimelineLoading(true);
        setGroupConversations(groups);
        setDmConversationByUserId(dmConversationMap);
        setChatError("");
      } catch (error) {
        console.error("Unable to initialize chat", error);
        if (isMounted) {
          setChatError(error instanceof Error ? error.message : "Unable to load TeamChat.");
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    void initializeChat();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentProfile?.id) {
      return;
    }

    return subscribeToTeamPresence(
      { id: currentProfile.id, displayName: currentProfile.display_name },
      setOnlineUserIds
    );
  }, [currentProfile?.display_name, currentProfile?.id]);

  useEffect(() => {
    if (!currentProfile?.id) {
      return;
    }

    const channel = createTypingChannel();
    typingChannelRef.current = channel;

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const nextPayload = payload as {
          conversationId?: string;
          userId?: string;
          displayName?: string;
          typing?: boolean;
        };
        if (!nextPayload.conversationId || !nextPayload.userId || !nextPayload.displayName) {
          return;
        }
        if (nextPayload.userId === currentProfile.id) {
          return;
        }
        setTypingByConversationId((existing) => {
          const currentConversationTyping = existing[nextPayload.conversationId!] ?? {};
          if (!nextPayload.typing) {
            const restTyping = { ...currentConversationTyping };
            delete restTyping[nextPayload.userId!];
            return {
              ...existing,
              [nextPayload.conversationId!]: restTyping,
            };
          }
          return {
            ...existing,
            [nextPayload.conversationId!]: {
              ...currentConversationTyping,
              [nextPayload.userId!]: nextPayload.displayName!,
            },
          };
        });
      })
      .subscribe();

    return () => {
      if (typingIdleTimerRef.current) {
        window.clearTimeout(typingIdleTimerRef.current);
      }
      void supabase.removeChannel(channel);
      typingChannelRef.current = null;
      setTypingByConversationId({});
    };
  }, [currentProfile?.id]);

  useEffect(() => {
    if (!currentProfile?.id) {
      return;
    }

    const conversationIds = [
      ...Object.values(dmConversationByUserId),
      ...groupConversations.map((conversation) => conversation.id),
    ];

    if (conversationIds.length === 0) {
      setLatestMessageByConversationId({});
      return;
    }

    const uniqueConversationIds = Array.from(new Set(conversationIds));
    void getLatestMessagesByConversationId(uniqueConversationIds)
      .then((latestMessages) => {
        setLatestMessageByConversationId(latestMessages);
      })
      .catch(() => {
        // Non-blocking for sidebar list.
      });
  }, [currentProfile?.id, dmConversationByUserId, groupConversations]);

  useEffect(() => {
    if (!currentProfile?.id) {
      return;
    }

    const conversationIds = [
      ...Object.values(dmConversationByUserId),
      ...groupConversations.map((conversation) => conversation.id),
    ];

    if (conversationIds.length === 0) {
      setUnreadByConversationId({});
      return;
    }

    const uniqueConversationIds = Array.from(new Set(conversationIds));
    let cancelled = false;

    void getUnreadMessageCountsByConversationIds(uniqueConversationIds)
      .then((counts) => {
        if (cancelled) {
          return;
        }
        const openId = activeConversationIdRef.current;
        setUnreadByConversationId((prev) => {
          const next: Record<string, number> = { ...prev };
          for (const id of uniqueConversationIds) {
            next[id] = id === openId ? 0 : counts[id] ?? 0;
          }
          return next;
        });
      })
      .catch((err) => {
        console.warn("[unread counts] unable to sync from server", err);
      });

    return () => {
      cancelled = true;
    };
  }, [currentProfile?.id, dmConversationByUserId, groupConversations]);

  useEffect(() => {
    if (!currentProfile || isInitializing || hasCompletedInitialLoadRef.current) {
      return;
    }

    hasCompletedInitialLoadRef.current = true;

    if (!conversationIdFromRoute) {
      return;
    }

    const accessibleConversation = groupConversations.find((conversation) => conversation.id === conversationIdFromRoute);
    if (accessibleConversation) {
      setActiveConversation(accessibleConversation);
      setUnreadByConversationId((existing) => ({ ...existing, [conversationIdFromRoute]: 0 }));
      setRestoredConversationId(conversationIdFromRoute);
      return;
    }

    const openKnownDm = async () => {
      const dmEntry = Object.entries(dmConversationByUserId).find(([, dmConversationId]) => dmConversationId === conversationIdFromRoute);
      if (!dmEntry) {
        return false;
      }
      const [targetUserId] = dmEntry;
      setSelectedUpdatesUserId(targetUserId);
      setUnreadByConversationId((existing) => ({ ...existing, [conversationIdFromRoute]: 0 }));
      setActiveConversation(await getConversationById(conversationIdFromRoute));
      setRestoredConversationId(conversationIdFromRoute);
      return true;
    };

    const verifyRouteConversationMembership = async () => {
      try {
        const [conversation, members] = await Promise.all([
          getConversationById(conversationIdFromRoute),
          getConversationMembers(conversationIdFromRoute),
        ]);
        const memberIds = members.map((member) => member.user_id);
        const isMember = memberIds.includes(currentProfile.id);
        if (!isMember) {
          throw new Error("Not a member of this conversation.");
        }
        setActiveConversation(conversation);
        setUnreadByConversationId((existing) => ({ ...existing, [conversationIdFromRoute]: 0 }));
        setRestoredConversationId(conversationIdFromRoute);
        return true;
      } catch {
        return false;
      }
    };

    void openKnownDm()
      .then((opened) => {
        if (opened) {
          return;
        }
        void verifyRouteConversationMembership().then((isMember) => {
          if (isMember) {
            return;
          }
          setActiveConversation(null);
          setActiveConversationMembers([]);
          setMessages([]);
          setRestoredConversationId(null);
          navigate("/", { replace: true });
        });
      })
      .catch(() => {
        setActiveConversation(null);
        setActiveConversationMembers([]);
        setMessages([]);
        setRestoredConversationId(null);
        navigate("/", { replace: true });
      });
  }, [
    conversationIdFromRoute,
    currentProfile,
    dmConversationByUserId,
    groupConversations,
    isInitializing,
    navigate,
  ]);

  useEffect(() => {
    if (!activeConversation?.id) {
      return;
    }

    let isMounted = true;
    const loadConversation = async () => {
      try {
        const [conversation, members, initialMessages] = await Promise.all([
          getConversationById(activeConversation.id),
          getConversationMembers(activeConversation.id),
          getRecentMessages(activeConversation.id, CHAT_INITIAL_PAGE_SIZE),
        ]);

        if (!isMounted) {
          return;
        }

        setActiveConversation(conversation);
        setActiveConversationMembers(members);
        setMessages(initialMessages);
        setHasMoreOlderMessages(initialMessages.length >= CHAT_INITIAL_PAGE_SIZE);
      } catch (error) {
        if (isMounted) {
          setChatError(error instanceof Error ? error.message : "Unable to load conversation.");
        }
      }
    };

    void loadConversation();

    return () => {
      isMounted = false;
    };
  }, [activeConversation?.id]);

  useEffect(() => {
    setReadReceiptCursorById({});
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation?.id) {
      return;
    }

    const inWindow = new Set(messages.map((m) => m.id));
    const idsToFetch = Array.from(
      new Set(
        activeConversationMembers
          .map((m) => m.last_read_message_id)
          .filter((id): id is string => Boolean(id))
          .filter((id) => !inWindow.has(id))
      )
    );

    if (idsToFetch.length === 0) {
      return;
    }

    let cancelled = false;
    void getMessagesByIds(idsToFetch)
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setReadReceiptCursorById((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            next[row.id] = row;
          }
          return next;
        });
      })
      .catch(() => {
        /* read receipts degrade to Sent if cursor rows fail to load */
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversation?.id, activeConversationMembers, messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [activeConversation?.id]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = activeConversation?.id;
    if (!conversationId || loadingOlderGuardRef.current || !hasMoreOlderMessages) {
      return;
    }
    const first = messagesRef.current[0];
    if (!first) {
      return;
    }

    const el = messageListRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    loadingOlderGuardRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const older = await getMessagesOlderThan(conversationId, first, CHAT_OLDER_PAGE_SIZE);
      if (activeConversationIdRef.current !== conversationId) {
        return;
      }
      if (older.length === 0) {
        setHasMoreOlderMessages(false);
        return;
      }

      const existingIds = new Set(messagesRef.current.map((m) => m.id));
      const merged = older.filter((o) => !existingIds.has(o.id));
      if (merged.length === 0) {
        setHasMoreOlderMessages(false);
        return;
      }

      setHasMoreOlderMessages(older.length >= CHAT_OLDER_PAGE_SIZE);
      pendingScrollRestoreRef.current = { prevHeight, prevScrollTop };
      setMessages((prev) => [...merged, ...prev]);
    } catch (err) {
      console.error("Unable to load older messages", err);
    } finally {
      loadingOlderGuardRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [activeConversation?.id, hasMoreOlderMessages]);

  const MESSAGE_LIST_STICK_THRESHOLD_PX = 120;
  const MESSAGE_LIST_LOAD_OLDER_TOP_PX = 160;

  const onMessageListScroll = () => {
    const el = messageListRef.current;
    if (!el) {
      return;
    }
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < MESSAGE_LIST_STICK_THRESHOLD_PX;

    if (
      el.scrollTop <= MESSAGE_LIST_LOAD_OLDER_TOP_PX &&
      hasMoreOlderMessages &&
      !loadingOlderGuardRef.current
    ) {
      void loadOlderMessages();
    }
  };

  useLayoutEffect(() => {
    const el = messageListRef.current;
    if (!el || !activeConversation) {
      return;
    }
    const pending = pendingScrollRestoreRef.current;
    if (pending) {
      pendingScrollRestoreRef.current = null;
      const delta = el.scrollHeight - pending.prevHeight;
      el.scrollTop = pending.prevScrollTop + delta;
      return;
    }
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, activeConversation]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation?.id || messages.length === 0) {
      return;
    }
    const conversationId = activeConversation.id;
    const latest = messages[messages.length - 1];
    const timer = window.setTimeout(() => {
      const sock = socketRef.current;
      if (!sock?.connected || activeConversationIdRef.current !== conversationId) {
        return;
      }
      sock.emit("message:read", { conversationId, lastReadMessageId: latest.id });
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeConversation?.id, messages]);

  useEffect(() => {
    const attachmentPaths = Array.from(
      new Set(messages.map((message) => message.attachment_path).filter((path): path is string => Boolean(path)))
    );

    if (attachmentPaths.length === 0) {
      return;
    }

    const missingPaths = attachmentPaths.filter((path) => !attachmentUrlByPath[path]);
    if (missingPaths.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      missingPaths.map(async (path) => {
        const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
        if (error || !data?.signedUrl) {
          return null;
        }
        return [path, data.signedUrl] as const;
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      const mapped = entries.filter((entry): entry is readonly [string, string] => Boolean(entry));
      if (mapped.length === 0) {
        return;
      }
      setAttachmentUrlByPath((existing) => ({
        ...existing,
        ...Object.fromEntries(mapped),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentUrlByPath, messages]);

  const mergeIncomingMessage = useCallback(
    (message: ChatMessage) => {
      const activeConversationId = activeConversationIdRef.current;
      const isOpenConversation = message.conversation_id === activeConversationId;
      setLatestMessageByConversationId((existing) => ({
        ...existing,
        [message.conversation_id]: message,
      }));

      if (isOpenConversation) {
        setMessages((existing) => {
          if (existing.some((item) => item.id === message.id)) {
            return existing;
          }
          return [...existing, message];
        });
      } else if (currentProfile && message.sender_id !== currentProfile.id) {
        setUnreadByConversationId((existing) => ({
          ...existing,
          [message.conversation_id]: (existing[message.conversation_id] ?? 0) + 1,
        }));
      }
    },
    [currentProfile?.id]
  );

  useEffect(() => {
    if (!currentProfile?.id) {
      return;
    }

    let cancelled = false;

    const onMessageNew = (incomingPayload: Parameters<typeof toChatMessageFromSocket>[0]) => {
      mergeIncomingMessage(toChatMessageFromSocket(incomingPayload));
    };

    const onMessageRead = (payload: { conversationId: string; userId: string; lastReadMessageId: string }) => {
      if (cancelled || payload.conversationId !== activeConversationIdRef.current) {
        return;
      }
      setActiveConversationMembers((prev) =>
        prev.map((m) => {
          if (m.user_id !== payload.userId) {
            return m;
          }
          const byId = new Map(messagesRef.current.map((x) => [x.id, x]));
          const prevId = m.last_read_message_id;
          if (!prevId) {
            return { ...m, last_read_message_id: payload.lastReadMessageId };
          }
          const prevMsg = byId.get(prevId);
          const nextMsg = byId.get(payload.lastReadMessageId);
          if (prevMsg && nextMsg && compareMessagesForOrdering(nextMsg, prevMsg) < 0) {
            return m;
          }
          return { ...m, last_read_message_id: payload.lastReadMessageId };
        })
      );
    };

    const onMessageError = (errorPayload: { message: string }) => {
      if (cancelled) {
        return;
      }
      setChatError(errorPayload.message || "Message failed.");
    };
    const onUserStatsUpdated = (payload: UserStats) => {
      if (cancelled || !payload?.userId) {
        return;
      }
      setMemberStatsByUserId((existing) => ({
        ...existing,
        [payload.userId]: payload,
      }));
    };

    const bindSocketListeners = (nextSocket: ReturnType<typeof getSocketClient>) => {
      const previousSocket = socketRef.current;
      if (previousSocket && previousSocket !== nextSocket) {
        previousSocket.off("message:new", onMessageNew);
        previousSocket.off("message:read", onMessageRead);
        previousSocket.off("message:error", onMessageError);
        previousSocket.off("user:stats_updated", onUserStatsUpdated);
        if (socketConnectJoinHandlerRef.current) {
          previousSocket.off("connect", socketConnectJoinHandlerRef.current);
        }
      }
      if (!nextSocket) {
        socketRef.current = null;
        return;
      }
      nextSocket.off("message:new", onMessageNew);
      nextSocket.off("message:read", onMessageRead);
      nextSocket.off("message:error", onMessageError);
      nextSocket.off("user:stats_updated", onUserStatsUpdated);
      nextSocket.on("message:new", onMessageNew);
      nextSocket.on("message:read", onMessageRead);
      nextSocket.on("message:error", onMessageError);
      nextSocket.on("user:stats_updated", onUserStatsUpdated);

      if (socketConnectJoinHandlerRef.current) {
        nextSocket.off("connect", socketConnectJoinHandlerRef.current);
      }
      const joinAllMyConversationRooms = () => {
        if (!nextSocket.connected) {
          return;
        }
        joinedConversationRoomsRef.current = new Set();
        const ids = new Set<string>(
          [
            ...Object.values(dmConversationByUserIdRef.current),
            ...groupConversationsRef.current.map((g) => g.id),
          ].filter(Boolean) as string[]
        );
        const activeId = activeConversationIdRef.current;
        if (activeId) {
          ids.add(activeId);
        }
        for (const conversationId of ids) {
          nextSocket.emit("conversation:join", { conversationId });
          joinedConversationRoomsRef.current.add(conversationId);
        }
      };
      socketConnectJoinHandlerRef.current = joinAllMyConversationRooms;
      nextSocket.on("connect", joinAllMyConversationRooms);
      if (nextSocket.connected) {
        joinAllMyConversationRooms();
      }

      socketRef.current = nextSocket;
    };

    const connectSocket = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }
      if (error) {
        console.error("[socket] failed to get session", error.message);
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        console.warn("[socket] no session access token; socket not connected");
        return;
      }

      const nextSocket = getSocketClient(accessToken);
      bindSocketListeners(nextSocket);
    };

    void connectSocket();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) {
        const existingSocket = socketRef.current;
        if (existingSocket) {
          existingSocket.off("message:new", onMessageNew);
          existingSocket.off("message:read", onMessageRead);
          existingSocket.off("message:error", onMessageError);
          existingSocket.off("user:stats_updated", onUserStatsUpdated);
          if (socketConnectJoinHandlerRef.current) {
            existingSocket.off("connect", socketConnectJoinHandlerRef.current);
          }
        }
        disconnectSocketClient();
        socketRef.current = null;
        return;
      }

      const nextSocket = getSocketClient(session.access_token);
      bindSocketListeners(nextSocket);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      const existingSocket = socketRef.current;
      if (existingSocket) {
        existingSocket.off("message:new", onMessageNew);
        existingSocket.off("message:read", onMessageRead);
        existingSocket.off("message:error", onMessageError);
        existingSocket.off("user:stats_updated", onUserStatsUpdated);
        if (socketConnectJoinHandlerRef.current) {
          existingSocket.off("connect", socketConnectJoinHandlerRef.current);
        }
      }
      disconnectSocketClient();
      socketRef.current = null;
    };
  }, [currentProfile?.id, mergeIncomingMessage]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return;
    }

    const ids = new Set<string>(
      [...Object.values(dmConversationByUserId), ...groupConversations.map((g) => g.id)].filter(Boolean) as string[]
    );
    if (activeConversation?.id) {
      ids.add(activeConversation.id);
    }

    const prev = joinedConversationRoomsRef.current;
    for (const conversationId of ids) {
      if (!prev.has(conversationId)) {
        socket.emit("conversation:join", { conversationId });
      }
    }
    for (const conversationId of prev) {
      if (!ids.has(conversationId)) {
        socket.emit("conversation:leave", { conversationId });
      }
    }
    joinedConversationRoomsRef.current = new Set(ids);
  }, [dmConversationByUserId, groupConversations, activeConversation?.id]);

  useEffect(() => {
    if (!selectedUpdatesUserId) {
      return;
    }

    let isMounted = true;

    void fetchUpdatesForUser(selectedUpdatesUserId)
      .then((updates) => {
        if (!isMounted) {
          return;
        }
        setUpdatesByUserId((existing) => ({
          ...existing,
          [selectedUpdatesUserId]: updates,
        }));
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setTimelineError(error instanceof Error ? error.message : "Unable to load updates.");
      })
      .finally(() => {
        if (isMounted) {
          setTimelineLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedUpdatesUserId]);

  const profileById = useMemo(() => {
    const allProfiles = [...activeUsers];
    if (currentProfile) {
      allProfiles.push(currentProfile);
    }
    return new Map(allProfiles.map((profile) => [profile.id, profile]));
  }, [activeUsers, currentProfile]);

  const messageByIdForReadReceipts = useMemo(() => {
    const m = new Map<string, ChatMessage>();
    for (const row of Object.values(readReceiptCursorById)) {
      m.set(row.id, row);
    }
    for (const msg of messages) {
      m.set(msg.id, msg);
    }
    return m;
  }, [messages, readReceiptCursorById]);

  /** Own messages only: "Read" / "Sent" (DM), or "Read" / "Read n/N" / "Sent" (groups). */
  const readReceiptByMessageId = useMemo(() => {
    const map = new Map<string, string>();
    if (!currentProfile?.id) {
      return map;
    }
    const others = activeConversationMembers.filter((m) => m.user_id !== currentProfile.id);
    if (others.length === 0) {
      return map;
    }
    for (const message of messages) {
      if (message.sender_id !== currentProfile.id) {
        continue;
      }
      const readers = others.filter((member) =>
        memberReadCursorIncludesMessage(member.last_read_message_id, message, messageByIdForReadReceipts)
      );
      const allRead = readers.length === others.length;
      const anyRead = readers.length > 0;
      if (others.length === 1) {
        map.set(message.id, allRead ? "Read" : "Sent");
      } else if (allRead) {
        map.set(message.id, "Read");
      } else if (anyRead) {
        map.set(message.id, `Read ${readers.length}/${others.length}`);
      } else {
        map.set(message.id, "Sent");
      }
    }
    return map;
  }, [messages, activeConversationMembers, currentProfile?.id, messageByIdForReadReceipts]);

  const teammateNameById = useMemo(() => {
    const m: Record<string, string> = {};
    if (currentProfile) {
      m[currentProfile.id] = currentProfile.display_name;
    }
    for (const u of activeUsers) {
      m[u.id] = u.display_name;
    }
    return m;
  }, [currentProfile, activeUsers]);

  const collaboratorPickOptions = useMemo(
    () => activeUsers.map((u) => ({ id: u.id, display_name: u.display_name })),
    [activeUsers]
  );

  const teamCalendarOverlayUserIds = useMemo(() => {
    if (!currentProfile) {
      return undefined;
    }
    const others = activeUsers
      .filter((u) => u.id !== currentProfile.id)
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    return [currentProfile.id, ...others.map((u) => u.id)];
  }, [currentProfile, activeUsers]);

  useEffect(() => {
    if (!currentProfile) {
      return;
    }
    const validIds = new Set<string>([currentProfile.id, ...activeUsers.map((u) => u.id)]);
    if (primarySidebarTab !== "timeline") {
      return;
    }
    if (!timelineCalendarUserId || !validIds.has(timelineCalendarUserId)) {
      setTimelineCalendarUserId(currentProfile.id);
    }
  }, [primarySidebarTab, currentProfile, activeUsers, timelineCalendarUserId]);

  const selectedUpdatesProfile = useMemo(() => {
    if (!selectedUpdatesUserId) {
      return currentProfile;
    }
    return profileById.get(selectedUpdatesUserId) ?? currentProfile;
  }, [currentProfile, profileById, selectedUpdatesUserId]);

  const totalXpByUserId = useMemo(() => {
    const map: Record<string, number> = {};
    const allProfiles = currentProfile ? [currentProfile, ...activeUsers] : activeUsers;
    for (const user of allProfiles) {
      map[user.id] = memberStatsByUserId[user.id]?.xp ?? Math.max(0, Number(user.xp_total ?? 0));
    }
    return map;
  }, [activeUsers, currentProfile, memberStatsByUserId]);

  const currentUserRoleLabel = useMemo((): "You" | "Leader" => {
    if (!currentProfile) {
      return "You";
    }
    const email = currentProfile.email?.toLowerCase();
    if (email === "ariwang@portal.local" || currentProfile.display_name === "Ari Wang") {
      return "Leader";
    }
    return "You";
  }, [currentProfile]);

  const currentUserDayStreak = useMemo(() => {
    if (!currentProfile?.id) {
      return 0;
    }
    return memberStatsByUserId[currentProfile.id]?.streak ?? Math.max(0, Number(currentProfile.streak ?? 0));
  }, [currentProfile, memberStatsByUserId]);

  const selectedUpdates = useMemo(
    () => (selectedUpdatesUserId ? updatesByUserId[selectedUpdatesUserId] ?? [] : []),
    [selectedUpdatesUserId, updatesByUserId]
  );

  const availablePetIds = useMemo(() => PET_OPTIONS.map((option) => option.id), []);

  const typingNames = useMemo(() => {
    if (!activeConversation?.id) {
      return [];
    }
    return Object.values(typingByConversationId[activeConversation.id] ?? {});
  }, [activeConversation?.id, typingByConversationId]);

  const groupedUpdates = useMemo(() => {
    const grouped = new Map<string, UserUpdate[]>();
    for (const update of selectedUpdates) {
      const key = getDateKey(userUpdateDisplayAtIso(update));
      const existing = grouped.get(key) ?? [];
      existing.push(update);
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries())
      .map(
        ([k, arr]) =>
          [
            k,
            [...arr].sort(
              (a, b) =>
                new Date(userUpdateDisplayAtIso(b)).getTime() - new Date(userUpdateDisplayAtIso(a)).getTime()
            ),
          ] as const
      )
      .sort(([a], [b]) => (a > b ? -1 : 1));
  }, [selectedUpdates]);

  const expandedDatesForSelectedUser = expandedDatesByUserId[selectedUpdatesUserId ?? ""] ?? {};

  const renderPresencePetAvatar = (
    profile: InternalProfile | undefined,
    size: "xs" | "sm" | "md" | "lg" | "xl",
    extraClass = ""
  ) => {
    const isOnline = profile ? onlineUserIds.has(profile.id) : false;
    const petId = resolvePetIdForProfile(profile, currentProfile?.id, selectedPetId, availablePetIds);
    return (
      <span className="avatar-wrap">
        <PetAvatar
          petId={petId ?? undefined}
          imageUrl={profile?.avatar_url}
          label={profile?.display_name ?? "?"}
          size={size}
          clip="soft"
          className={extraClass}
        />
        <span
          className={`presence-dot ${isOnline ? "presence-dot-online" : "presence-dot-offline"}`}
          aria-label={isOnline ? "Online" : "Offline"}
        />
      </span>
    );
  };

  const activeDmPeerProfile = useMemo(() => {
    if (!activeConversation || activeConversation.type !== "dm" || !currentProfile) {
      return undefined;
    }
    const other = activeConversationMembers.find((member) => member.user_id !== currentProfile.id);
    return other ? profileById.get(other.user_id) : undefined;
  }, [activeConversation, activeConversationMembers, currentProfile, profileById]);

  const activeConversationTitle = useMemo(() => {
    if (!activeConversation) {
      return "Select a conversation";
    }

    if (activeConversation.type === "group") {
      return activeConversation.title || "Untitled group";
    }

    const otherMember = activeConversationMembers.find((member) => member.user_id !== currentProfile?.id);
    if (!otherMember) {
      return "Direct message";
    }

    return profileById.get(otherMember.user_id)?.display_name ?? "Direct message";
  }, [activeConversation, activeConversationMembers, currentProfile?.id, profileById]);

  const activeMemberProfiles = useMemo(
    () =>
      activeConversationMembers
        .map((member) => profileById.get(member.user_id))
        .filter((profile): profile is InternalProfile => Boolean(profile)),
    [activeConversationMembers, profileById]
  );

  const typingIndicatorText = useMemo(() => {
    if (typingNames.length === 0) {
      return "";
    }
    if (typingNames.length === 1) {
      return `${typingNames[0]} is typing...`;
    }
    if (typingNames.length === 2) {
      return `${typingNames[0]} and ${typingNames[1]} are typing...`;
    }
    return `${typingNames[0]}, ${typingNames[1]} and others are typing...`;
  }, [typingNames]);

  const isTeamDashboardView = !activeConversation && Boolean(currentProfile);

  useLayoutEffect(() => {
    if (!currentProfile?.id || !isTeamDashboardView || primarySidebarTab !== "home") {
      return;
    }
    setSelectedUpdatesUserId(currentProfile.id);
  }, [currentProfile?.id, isTeamDashboardView, primarySidebarTab]);

  const totalSidebarUnread = useMemo(
    () => Object.values(unreadByConversationId).reduce((sum, n) => sum + n, 0),
    [unreadByConversationId]
  );

  useEffect(() => {
    const el = hubRailScrollRegionRef.current;
    if (!el) {
      return;
    }
    if (isTeamDashboardView || showUpdatesPanel) {
      el.scrollTop = 0;
      requestAnimationFrame(() => {
        el.scrollTop = 0;
      });
    }
  }, [isTeamDashboardView, showUpdatesPanel, primarySidebarTab, currentProfile?.id]);

  const canManageActiveGroup = useMemo(() => {
    if (!activeConversation || activeConversation.type !== "group" || !currentProfile) {
      return false;
    }
    const email = currentProfile.email?.toLowerCase();
    const isAriByEmail = email === "ariwang@portal.local";
    const isAriByName = currentProfile.display_name === "Ari Wang";
    return activeConversation.created_by === currentProfile.id || isAriByEmail || isAriByName;
  }, [activeConversation, currentProfile]);

  const addMemberCandidates = useMemo(() => {
    const memberIdSet = new Set(activeConversationMembers.map((member) => member.user_id));
    return activeUsers.filter((user) => !memberIdSet.has(user.id));
  }, [activeConversationMembers, activeUsers]);

  const refreshGroups = async () => {
    if (!currentProfile) {
      return;
    }
    const groups = await getGroupConversationsForUser(currentProfile.id);
    setGroupConversations(groups);
  };

  const refreshActiveConversation = async () => {
    if (!activeConversation?.id) {
      return;
    }
    const [conversation, members] = await Promise.all([
      getConversationById(activeConversation.id),
      getConversationMembers(activeConversation.id),
    ]);
    setActiveConversation(conversation);
    setActiveConversationMembers(members);
  };

  const openDmConversation = async (targetUserId: string) => {
    try {
      setChatError("");
      const conversationId = await getOrCreateDmConversation(targetUserId);
      setSelectedUpdatesUserId(targetUserId);
      setUnreadByConversationId((existing) => ({ ...existing, [conversationId]: 0 }));
      setDmConversationByUserId((existing) => ({ ...existing, [targetUserId]: conversationId }));
      setActiveConversation(await getConversationById(conversationId));
      setPrimarySidebarTab("messages");
      navigate(`/chat/${conversationId}`);
      await refreshGroups();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to open direct message.");
    }
  };

  const openGroupConversation = async (conversation: ConversationSummary) => {
    setUnreadByConversationId((existing) => ({ ...existing, [conversation.id]: 0 }));
    setActiveConversation(conversation);
    navigate(`/chat/${conversation.id}`);
    setChatError("");
  };

  /** Conversation with the most recent message (DM or group); null if none loaded yet. */
  const lastMessagedConversationId = useMemo(() => {
    const candidateIds = new Set<string>([
      ...Object.values(dmConversationByUserId),
      ...groupConversations.map((g) => g.id),
    ]);
    let bestId: string | null = null;
    let bestTime = -1;
    for (const conversationId of candidateIds) {
      const latest = latestMessageByConversationId[conversationId];
      if (!latest?.created_at) {
        continue;
      }
      const t = new Date(latest.created_at).getTime();
      if (t > bestTime) {
        bestTime = t;
        bestId = conversationId;
      }
    }
    return bestId;
  }, [dmConversationByUserId, groupConversations, latestMessageByConversationId]);

  const goToDashboard = (options?: { sidebarTab?: SidebarPrimaryTabId }) => {
    const hadConversation = Boolean(activeConversation);
    setActiveConversation(null);
    setActiveConversationMembers([]);
    setMessages([]);
    setChatError("");
    navigate("/", { replace: true });
    if (options?.sidebarTab !== undefined) {
      setPrimarySidebarTab(options.sidebarTab);
    } else if (hadConversation) {
      setPrimarySidebarTab("home");
    }
  };

  const handlePrimarySidebarTab = (tab: SidebarPrimaryTabId) => {
    if (tab === "messages") {
      if (lastMessagedConversationId) {
        const group = groupConversations.find((g) => g.id === lastMessagedConversationId);
        if (group) {
          void openGroupConversation(group);
          return;
        }
      }
      setPrimarySidebarTab("messages");
      return;
    }

    if (tab === "timeline" && activeConversation) {
      goToDashboard({ sidebarTab: "timeline" });
      setShowUpdatesPanel(true);
      return;
    }

    setPrimarySidebarTab(tab);
    if (tab === "home" || tab === "team") {
      goToDashboard();
    }
    if (tab === "timeline") {
      setShowUpdatesPanel(true);
    }
    if (tab === "settings") {
      if (activeConversation) {
        goToDashboard();
      }
      setShowIdentityBar(true);
    }
  };

  const handleLogout = async () => {
    const ok = window.confirm("Log out?");
    if (!ok) {
      return;
    }
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const handleViewUpdatesProfile = (targetUserId: string) => {
    if (!activeConversation) {
      setPrimarySidebarTab("timeline");
    }
    if (targetUserId === selectedUpdatesUserId) {
      setShowUpdatesPanel(true);
      return;
    }
    setTimelineError("");
    setTimelineLoading(true);
    setSelectedUpdatesUserId(targetUserId);
    setShowUpdatesPanel(true);
  };

  const toggleDateGroup = (dateKey: string) => {
    if (!selectedUpdatesUserId) {
      return;
    }
    setExpandedDatesByUserId((existing) => ({
      ...existing,
      [selectedUpdatesUserId]: {
        ...(existing[selectedUpdatesUserId] ?? {}),
        [dateKey]: !(existing[selectedUpdatesUserId] ?? {})[dateKey],
      },
    }));
  };

  const handlePostUpdate = async () => {
    if (!currentProfile?.id) {
      return;
    }
    try {
      setIsPostingUpdate(true);
      setTimelineError("");
      const created = await createMyUpdate(timelineInput);
      setTimelineInput("");
      setSelectedUpdatesUserId(currentProfile.id);
      setUpdatesByUserId((existing) => ({
        ...existing,
        [currentProfile.id]: [created, ...(existing[currentProfile.id] ?? [])],
      }));
      const todayKey = getDateKey(userUpdateDisplayAtIso(created));
      setExpandedDatesByUserId((existing) => ({
        ...existing,
        [currentProfile.id]: {
          ...(existing[currentProfile.id] ?? {}),
          [todayKey]: true,
        },
      }));
      const previousLevel = memberStatsByUserId[currentProfile.id]?.level ?? Math.max(1, Number(currentProfile.level ?? 1));
      const nextStats = await awardMyUpdateXp();
      setMemberStatsByUserId((existing) => ({
        ...existing,
        [nextStats.userId]: nextStats,
      }));
      if (nextStats.level > previousLevel) {
        setLevelUpToast(`Level up! You reached Lv. ${nextStats.level}`);
      }
    } catch (error) {
      setTimelineError(error instanceof Error ? error.message : "Unable to post update.");
    } finally {
      setIsPostingUpdate(false);
    }
  };

  const handleDeleteUpdate = async (updateId: string) => {
    const confirmed = window.confirm("Delete this update?");
    if (!confirmed || !selectedUpdatesUserId) {
      return;
    }

    try {
      setTimelineError("");
      await deleteMyUpdate(updateId);
      setUpdatesByUserId((existing) => ({
        ...existing,
        [selectedUpdatesUserId]: (existing[selectedUpdatesUserId] ?? []).filter((update) => update.id !== updateId),
      }));
      setExpandedUpdateIds((existing) => {
        const next = new Set(existing);
        next.delete(updateId);
        return next;
      });
    } catch (error) {
      setTimelineError(error instanceof Error ? error.message : "Unable to delete update.");
    }
  };

  const handleOpenGroupInfo = () => {
    if (activeConversation?.type !== "group") {
      return;
    }
    setShowGroupInfoModal(true);
    setChatError("");
  };

  const handleAddGroupMembers = async (selectedUserIds: string[]) => {
    if (!activeConversation?.id) {
      return;
    }
    setIsGroupActionSubmitting(true);
    try {
      await addGroupMembers(activeConversation.id, selectedUserIds);
      await Promise.all([refreshActiveConversation(), refreshGroups()]);
      setShowAddMembersModal(false);
      setChatError("");
    } finally {
      setIsGroupActionSubmitting(false);
    }
  };

  const handleRemoveGroupMember = async (member: InternalProfile) => {
    if (!activeConversation?.id) {
      return;
    }
    const confirmed = window.confirm(`Remove ${member.display_name} from this group?`);
    if (!confirmed) {
      return;
    }

    setIsGroupActionSubmitting(true);
    try {
      await removeGroupMember(activeConversation.id, member.id);
      await Promise.all([refreshActiveConversation(), refreshGroups()]);
      setChatError("");
    } finally {
      setIsGroupActionSubmitting(false);
    }
  };

  const handleDissolveGroup = async () => {
    if (!activeConversation?.id) {
      return;
    }
    const confirmed = window.confirm("This will delete the group chat for all members.");
    if (!confirmed) {
      return;
    }

    setIsGroupActionSubmitting(true);
    try {
      await dissolveGroup(activeConversation.id);
      await refreshGroups();
      setActiveConversation(null);
      setActiveConversationMembers([]);
      setMessages([]);
      setShowAddMembersModal(false);
      setShowGroupInfoModal(false);
      navigate("/", { replace: true });
      setChatError("");
    } finally {
      setIsGroupActionSubmitting(false);
    }
  };

  const handleCreateGroup = async (title: string, selectedUserIds: string[]) => {
    if (!currentProfile) {
      return;
    }

    setIsCreatingGroup(true);
    try {
      const conversationId = await createGroupConversation(currentProfile.id, title, selectedUserIds);
      await refreshGroups();
      const conversation = await getConversationById(conversationId);
      setUnreadByConversationId((existing) => ({ ...existing, [conversation.id]: 0 }));
      setActiveConversation(conversation);
      navigate(`/chat/${conversation.id}`);
      setShowGroupModal(false);
      setChatError("");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const ensureChatTransportReady = async () => {
    const socket = socketRef.current;
    if (!socket) {
      throw new Error("Chat is still connecting. Try again in a moment.");
    }
    if (socket.connected) {
      return;
    }
    const probe = await probeTeamchatApiHealth();
    if (!probe.ok) {
      throw new Error(`TeamChat API: ${probe.message}`);
    }
    if (typeof window !== "undefined" && window.location.protocol === "https:") {
      const socketUrl = getResolvedSocketUrl();
      if (socketUrl.startsWith("http://")) {
        throw new Error(
          `Chat realtime: Socket.IO target is ${socketUrl} but this site is HTTPS — browsers block mixed content. Set VITE_API_URL or VITE_SOCKET_URL to an https:// API URL in Cloudflare Pages (build env) and redeploy.`
        );
      }
    }
    nudgeSocketReconnect(socket);
    const wait = await waitForSocketConnection(socket, SOCKET_READY_WAIT_MS);
    if (!wait.ok) {
      throw new Error(`Chat realtime: ${wait.reason}`);
    }
  };

  const handleSend = async (event?: FormEvent<HTMLFormElement> | ReactMouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();

    if (!activeConversation?.id || !composerText.trim()) {
      return;
    }

    try {
      setIsSending(true);
      setChatError("");
      if (typingChannelRef.current && activeConversation?.id && currentProfile?.id) {
        void typingChannelRef.current.send({
          type: "broadcast",
          event: "typing",
          payload: {
            conversationId: activeConversation.id,
            userId: currentProfile.id,
            displayName: currentProfile.display_name,
            typing: false,
          },
        });
      }
      await ensureChatTransportReady();
      const socket = socketRef.current;
      if (!socket) {
        throw new Error("Chat is still connecting. Try again in a moment.");
      }
      const ackPayload = await emitMessageSendAndWait(socket, {
        conversationId: activeConversation.id,
        body: composerText.trim(),
        messageType: "text",
      });
      mergeIncomingMessage(toChatMessageFromSocket(ackPayload));
      setComposerText("");
      await refreshGroups();
    } catch (error) {
      console.error("[handleSend failed]", error);
      setChatError(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachmentSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeConversation?.id || !currentProfile?.id) {
      return;
    }

    const isImage = file.type.startsWith("image/");
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size > maxBytes) {
      setChatError(isImage ? "Images must be <= 10MB." : "Files must be <= 20MB.");
      event.target.value = "";
      return;
    }

    if (!isImage && !ALLOWED_FILE_MIME_EXACT.has(file.type)) {
      setChatError("This file type is not allowed.");
      event.target.value = "";
      return;
    }

    try {
      setIsUploadingAttachment(true);
      setChatError("");

      const filePath = `${activeConversation.id}/${currentProfile.id}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        throw new Error(uploadError.message);
      }

      await ensureChatTransportReady();
      const socket = socketRef.current;
      if (!socket) {
        throw new Error("Chat is still connecting. Try again in a moment.");
      }
      const ackPayload = await emitMessageSendAndWait(socket, {
        conversationId: activeConversation.id,
        body: "",
        messageType: isImage ? "image" : "file",
        attachment: {
          path: filePath,
          name: file.name,
          mimeType: file.type,
          size: file.size,
        },
      });
      mergeIncomingMessage(toChatMessageFromSocket(ackPayload));
      await refreshGroups();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to upload attachment.");
    } finally {
      setIsUploadingAttachment(false);
      event.target.value = "";
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleComposerChange = (value: string) => {
    setComposerText(value);
    if (!activeConversation?.id || !currentProfile?.id || !typingChannelRef.current) {
      return;
    }

    const sendTyping = (typing: boolean) =>
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: {
          conversationId: activeConversation.id,
          userId: currentProfile.id,
          displayName: currentProfile.display_name,
          typing,
        },
      });

    void sendTyping(true);
    if (typingIdleTimerRef.current) {
      window.clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      void sendTyping(false);
      typingIdleTimerRef.current = null;
    }, 1500);
  };

  const handleSelectEmoji = (emoji: string) => {
    const textarea = composerRef.current;
    if (!textarea) {
      setComposerText((existing) => `${existing}${emoji}`);
      setShowEmojiMenu(false);
      return;
    }

    const start = textarea.selectionStart ?? composerText.length;
    const end = textarea.selectionEnd ?? composerText.length;

    setComposerText((existing) => `${existing.slice(0, start)}${emoji}${existing.slice(end)}`);
    setShowEmojiMenu(false);

    requestAnimationFrame(() => {
      const nextCaret = start + emoji.length;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  useEffect(() => {
    if (!showEmojiMenu) {
      return;
    }

    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      if (emojiMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setShowEmojiMenu(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showEmojiMenu]);

  useEffect(() => {
    if (!activeConversation?.id) {
      if (conversationIdFromRoute && restoredConversationId !== conversationIdFromRoute) {
        navigate("/", { replace: true });
      }
      return;
    }

    if (conversationIdFromRoute !== activeConversation.id) {
      navigate(`/chat/${activeConversation.id}`, { replace: true });
    }
  }, [activeConversation?.id, conversationIdFromRoute, navigate, restoredConversationId]);

  useEffect(() => {
    if (!activeConversation?.id || !currentProfile?.id) {
      return;
    }
    setTypingByConversationId((existing) => ({
      ...existing,
      [activeConversation.id]: {},
    }));
  }, [activeConversation?.id, currentProfile?.id]);

  if (isInitializing) {
    return <div className="route-loading">Loading TeamChat...</div>;
  }

  const workspaceNavTree =
    currentProfile ? (
      <WorkspaceNavTree
        activeTab={primarySidebarTab}
        onSelectTab={handlePrimarySidebarTab}
        messagesBadgeCount={totalSidebarUnread}
        activeUsers={activeUsers}
        groupConversations={groupConversations}
        dmConversationByUserId={dmConversationByUserId}
        unreadByConversationId={unreadByConversationId}
        latestMessageByConversationId={latestMessageByConversationId}
        activeConversationId={activeConversation?.id}
        onOpenDm={(userId) => void openDmConversation(userId)}
        onOpenGroup={openGroupConversation}
        onNewGroup={() => setShowGroupModal(true)}
        formatUnreadCount={formatUnreadCount}
        renderPresencePetAvatar={renderPresencePetAvatar}
      />
    ) : null;

  const appShellTheme = getThemeCssVars(selectedThemeColor) as CSSProperties;

  return (
    <div className="app-container">
      {levelUpToast ? (
        <div className="level-up-toast" role="status">
          {levelUpToast}
        </div>
      ) : null}
      <div className="app-shell" style={appShellTheme}>
      <aside className="sidebar sidebar-panel">
        <div className="sidebar-layout">
          {currentProfile ? (
            <div className="sidebar-player-card-slot">
              <CurrentUserPlayerCard
                displayName={currentProfile.display_name}
                imageUrl={currentProfile.avatar_url}
                selectedPetId={selectedPetId}
                totalXp={totalXpByUserId[currentProfile.id] ?? 0}
                isOnline
                roleLabel={currentUserRoleLabel}
                dayStreak={currentUserDayStreak}
                isIdentityPanelOpen={showIdentityBar}
                onPetIconClick={() => setShowIdentityBar((open) => !open)}
                onOpenProfile={() => {
                  goToDashboard({ sidebarTab: "timeline" });
                  void handleViewUpdatesProfile(currentProfile.id);
                }}
              />
            </div>
          ) : null}

          <div className="sidebar-below-player-scroll">
            {!hideWorkspaceSidebarColumn ? workspaceNavTree : null}

          <div className="sidebar-tab-panel">
            {!isTeamDashboardView ? (
              <div className="sidebar-body-scroll">
                <p className="sidebar-tab-sheet__muted sidebar-left-chat-hint">
                  Switch chats from <strong className="sidebar-tab-sheet__strong">Messages</strong> in the tree above
                  (expand to see DMs and groups).
                </p>
              </div>
            ) : isTeamDashboardView && primarySidebarTab === "messages" ? (
              <div className="sidebar-body-scroll">
                <p className="sidebar-tab-sheet__muted sidebar-left-chat-hint">
                  Choose a direct message or group under <strong className="sidebar-tab-sheet__strong">Messages</strong>{" "}
                  in the tree above.
                </p>
              </div>
            ) : primarySidebarTab === "home" ? null : (
              <div className="sidebar-body-scroll sidebar-tab-sheet">
                {primarySidebarTab === "tasks" ? (
                  <>
                    <p className="sidebar-tab-sheet__title">Tasks</p>
                    <p className="sidebar-tab-sheet__muted">Task lists and assignments will show here in a future update.</p>
                  </>
                ) : null}
                {primarySidebarTab === "timeline" ? (
                  <>
                    <p className="sidebar-tab-sheet__title">Timeline</p>
                    <p className="sidebar-tab-sheet__muted">
                      The week grid is in the center. Pick a teammate in the right workspace panel to view their
                      calendar, or schedule a collab or meeting from there.
                    </p>
                  </>
                ) : null}
                {primarySidebarTab === "team" ? (
                  <>
                    <p className="sidebar-tab-sheet__title">Team · Pets &amp; Rewards</p>
                    <p className="sidebar-tab-sheet__muted">
                      The center map shows everyone&apos;s pets. Drag empty map space to pan and use the scroll wheel to
                      zoom; drag your character on the map to place yourself (saved on this device). Earn XP from
                      daily updates in the Timeline tab.
                    </p>
                    <button type="button" className="sidebar-tab-sheet__cta" onClick={() => goToDashboard()}>
                      View team map
                    </button>
                  </>
                ) : null}
                {primarySidebarTab === "settings" ? (
                  <>
                    <p className="sidebar-tab-sheet__title">Settings</p>
                    <p className="sidebar-tab-sheet__muted">Change your pet, theme color, and identity card.</p>
                    <button type="button" className="sidebar-tab-sheet__cta" onClick={() => setShowIdentityBar(true)}>
                      Open identity &amp; appearance
                    </button>
                  </>
                ) : null}
              </div>
            )}
          </div>
          </div>

          {currentProfile ? (
            <div className="sidebar-footer-bar">
              <button
                type="button"
                className="sidebar-sign-out-btn"
                onClick={() => void handleLogout()}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="chat-panel center-column">
        <div className="chat-panel-inner center-content-inner">
          <div className="chat-panel-body">
          {!activeConversation && currentProfile ? (
            primarySidebarTab === "timeline" ? (
              <TimelineWeekCalendar
                calendarUserId={timelineCalendarUserId ?? currentProfile.id}
                viewerUserId={currentProfile.id}
                teammateNameById={teammateNameById}
                collaboratorPickOptions={collaboratorPickOptions}
                reloadToken={calendarReloadToken}
                onCalendarChanged={() => setCalendarReloadToken((n) => n + 1)}
                teamOverlayUserIds={teamCalendarOverlayUserIds}
                onUserUpdatesChanged={() => {
                  const uid = timelineCalendarUserId ?? currentProfile.id;
                  void fetchUpdatesForUser(uid)
                    .then((updates) => {
                      setUpdatesByUserId((existing) => ({ ...existing, [uid]: updates }));
                    })
                    .catch(() => {
                      /* rail may refetch when selected user changes */
                    });
                }}
                readOnlyBanner={
                  (timelineCalendarUserId ?? currentProfile.id) !== currentProfile.id
                    ? `Viewing ${profileById.get(timelineCalendarUserId ?? currentProfile.id)?.display_name ?? "Teammate"}'s calendar (read only)`
                    : undefined
                }
              />
            ) : (
              <TeamPetDashboard
                currentUser={currentProfile}
                teammates={activeUsers}
                currentUserPetId={selectedPetId}
                availablePetIds={availablePetIds}
                onlineUserIds={onlineUserIds}
                dmConversationByUserId={dmConversationByUserId}
                unreadByConversationId={unreadByConversationId}
                totalXpByUserId={totalXpByUserId}
                onOpenTeammateDm={(userId) => void openDmConversation(userId)}
                onOpenSelfIdentity={() => setShowIdentityBar(true)}
              />
            )
          ) : null}

          {activeConversation ? (
            <>
          <header className="panel-header">
            <div className="panel-header-title-block">
              {activeDmPeerProfile ? (
                <PetAvatar
                  petId={
                    resolvePetIdForProfile(
                      activeDmPeerProfile,
                      currentProfile?.id,
                      selectedPetId,
                      availablePetIds
                    ) ?? undefined
                  }
                  imageUrl={activeDmPeerProfile.avatar_url}
                  label={activeDmPeerProfile.display_name}
                  size="md"
                  clip="soft"
                />
              ) : null}
              <h2>{activeConversationTitle}</h2>
            </div>
            {activeConversation.type === "group" ? (
              <div className="panel-header-actions">
                <button type="button" className="group-info-button" onClick={handleOpenGroupInfo}>
                  Group Info
                </button>
              </div>
            ) : null}
          </header>

          <div className="message-list" ref={messageListRef} onScroll={onMessageListScroll}>
            {loadingOlderMessages ? (
              <div className="message-list__load-older" aria-live="polite">
                Loading older messages…
              </div>
            ) : null}
            {messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const isOwn = message.sender_id === currentProfile?.id;
              const isGrouped = isGroupedWithPrevious(message, previousMessage);
              const shouldShowTimestampGap = hasTimestampGap(message, previousMessage);
              const senderProfile = profileById.get(message.sender_id);

              return (
                <div key={message.id}>
                  {shouldShowTimestampGap ? (
                    <div className="message-separator">
                      {new Date(message.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  ) : null}
                  <article
                    className={`message-row ${isOwn ? "message-row-own" : "message-row-other"} ${isGrouped ? "message-row-grouped" : ""}`}
                  >
                    {!isOwn && !isGrouped
                      ? renderPresencePetAvatar(senderProfile, "md", "message-avatar")
                      : !isOwn
                        ? <span className="message-avatar-spacer" />
                        : null}
                    <div className="message-content">
                      {!isOwn && !isGrouped ? (
                        <strong className="message-sender">{senderProfile?.display_name ?? "Unknown user"}</strong>
                      ) : null}
                      <div className="message-bubble-wrap">
                        <div className="message-hover-actions" aria-hidden="true">
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(message.body || message.attachment_name || "")}
                            title="Copy message"
                          >
                            Copy
                          </button>
                          <button type="button" title="Add reaction">
                            🙂
                          </button>
                          <button type="button" title="More actions">
                            •••
                          </button>
                        </div>
                        {message.message_type === "image" && message.attachment_path ? (
                          <div className="message-attachment">
                            {attachmentUrlByPath[message.attachment_path] ? (
                              <a
                                href={attachmentUrlByPath[message.attachment_path]}
                                target="_blank"
                                rel="noreferrer"
                                className="message-attachment-image-link"
                              >
                                <img
                                  src={attachmentUrlByPath[message.attachment_path]}
                                  alt={message.attachment_name ?? "Image attachment"}
                                  className="message-attachment-image"
                                />
                              </a>
                            ) : (
                              <span className="message-attachment-loading">Loading image...</span>
                            )}
                            {message.body ? <p className="message-body">{message.body}</p> : null}
                          </div>
                        ) : null}
                        {message.message_type === "file" && message.attachment_path ? (
                          <div className="message-attachment message-attachment-file">
                            <span className="message-attachment-name">{message.attachment_name ?? "Attachment"}</span>
                            {attachmentUrlByPath[message.attachment_path] ? (
                              <a
                                href={attachmentUrlByPath[message.attachment_path]}
                                target="_blank"
                                rel="noreferrer"
                                className="message-attachment-link"
                              >
                                Open
                              </a>
                            ) : (
                              <span className="message-attachment-loading">Preparing file...</span>
                            )}
                            {message.body ? <p className="message-body">{message.body}</p> : null}
                          </div>
                        ) : null}
                        {message.message_type === "text" ? <p className="message-body">{message.body}</p> : null}
                      </div>
                      <div className="message-meta-row">
                        <span className="message-time">
                          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isOwn ? (
                          <span
                            className={`message-read-receipt${
                              (readReceiptByMessageId.get(message.id) ?? "Sent").startsWith("Read")
                                ? " message-read-receipt--read"
                                : " message-read-receipt--sent"
                            }`}
                          >
                            {readReceiptByMessageId.get(message.id) ?? "Sent"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </div>
              );
            })}
            {activeConversation && messages.length === 0 ? (
              <p className="empty-state">No messages yet. Start the conversation.</p>
            ) : null}
          </div>
          {typingIndicatorText ? <p className="typing-indicator">{typingIndicatorText}</p> : null}

            </>
          ) : null}
          {chatError ? (
            <p className="chat-error" role="alert">
              {chatError}
            </p>
          ) : null}
          </div>

          {activeConversation ? (
          <footer className="chat-input-bar">
            <div className="chat-input-emoji-slot" ref={emojiMenuRef}>
              {showEmojiMenu ? (
                <div className="emoji-menu">
                  {EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" className="emoji-menu-item" onClick={() => handleSelectEmoji(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="emoji-toggle"
                onClick={() => setShowEmojiMenu((existing) => !existing)}
                disabled={!activeConversation}
                aria-label="Open emoji picker"
              >
                🙂
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="attachment-input"
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={handleAttachmentSelect}
            />
            <button
              type="button"
              className="attachment-toggle"
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeConversation || isUploadingAttachment}
              aria-label="Upload attachment"
              title="Upload image or file"
            >
              {isUploadingAttachment ? "..." : "📎"}
            </button>
            <div className="composer-wrapper">
              <textarea
                ref={composerRef}
                placeholder="Type a message..."
                value={composerText}
                onChange={(event) => handleComposerChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={!activeConversation}
                rows={1}
              />
            </div>
            <button
              type="button"
              className="chat-input-send"
              onClick={handleSend}
              disabled={!activeConversation || isSending || isUploadingAttachment || !composerText.trim()}
            >
              Send
            </button>
          </footer>
          ) : null}
        </div>
      </main>

      <aside
        className={`right-panel updates-panel hub-rail${showUpdatesPanel ? " updates-panel-open" : ""}`.trim()}
      >
        <>
              <div
                id="hub-rail-scroll-region"
                ref={hubRailScrollRegionRef}
                className="hub-rail-scroll hub-rail-scroll--solo"
              >
              {hideWorkspaceSidebarColumn ? workspaceNavTree : null}
              {!isTeamDashboardView ? (
                <DailyUpdatesSection
                  variant="hub"
                  timelineScrollRef={timelineScrollRef}
                  currentProfile={currentProfile}
                  selectedUpdatesUserId={selectedUpdatesUserId}
                  selectedUpdatesProfile={selectedUpdatesProfile}
                  timelineInput={timelineInput}
                  onTimelineInputChange={setTimelineInput}
                  timelineLoading={timelineLoading}
                  timelineError={timelineError}
                  groupedUpdates={groupedUpdates}
                  expandedDatesForUser={expandedDatesForSelectedUser}
                  onToggleDateGroup={toggleDateGroup}
                  expandedUpdateIds={expandedUpdateIds}
                  onToggleExpandedUpdate={(updateId) =>
                    setExpandedUpdateIds((existing) => {
                      const next = new Set(existing);
                      if (next.has(updateId)) {
                        next.delete(updateId);
                      } else {
                        next.add(updateId);
                      }
                      return next;
                    })
                  }
                  onDeleteUpdate={handleDeleteUpdate}
                  isPostingUpdate={isPostingUpdate}
                  onPostUpdate={handlePostUpdate}
                  hubDailyExpanded={hubDailyExpanded}
                  onHubDailyExpandedToggle={() => setHubDailyExpanded((v) => !v)}
                  onViewUpdatesProfile={handleViewUpdatesProfile}
                  renderPresencePetAvatar={renderPresencePetAvatar}
                />
              ) : null}

              {isTeamDashboardView && primarySidebarTab === "timeline" && currentProfile ? (
                <TimelineCalendarTeamRail
                  currentProfile={currentProfile}
                  teammates={activeUsers}
                  selectedCalendarUserId={timelineCalendarUserId ?? currentProfile.id}
                  onSelectCalendarUserId={setTimelineCalendarUserId}
                  renderPresencePetAvatar={renderPresencePetAvatar}
                  onCalendarChanged={() => setCalendarReloadToken((n) => n + 1)}
                />
              ) : null}

              {isTeamDashboardView &&
              (primarySidebarTab === "home" || primarySidebarTab === "messages") &&
              currentProfile ? (
                <DailyUpdatesSection
                  variant="hub"
                  collapsible={false}
                  timelineScrollRef={timelineScrollRef}
                  currentProfile={currentProfile}
                  selectedUpdatesUserId={selectedUpdatesUserId}
                  selectedUpdatesProfile={selectedUpdatesProfile}
                  timelineInput={timelineInput}
                  onTimelineInputChange={setTimelineInput}
                  timelineLoading={timelineLoading}
                  timelineError={timelineError}
                  groupedUpdates={groupedUpdates}
                  expandedDatesForUser={expandedDatesForSelectedUser}
                  onToggleDateGroup={toggleDateGroup}
                  expandedUpdateIds={expandedUpdateIds}
                  onToggleExpandedUpdate={(updateId) =>
                    setExpandedUpdateIds((existing) => {
                      const next = new Set(existing);
                      if (next.has(updateId)) {
                        next.delete(updateId);
                      } else {
                        next.add(updateId);
                      }
                      return next;
                    })
                  }
                  onDeleteUpdate={handleDeleteUpdate}
                  isPostingUpdate={isPostingUpdate}
                  onPostUpdate={handlePostUpdate}
                  hubDailyExpanded
                  onHubDailyExpandedToggle={() => {}}
                  onViewUpdatesProfile={handleViewUpdatesProfile}
                  renderPresencePetAvatar={renderPresencePetAvatar}
                />
              ) : null}

          {currentProfile &&
          !(isTeamDashboardView && primarySidebarTab === "timeline") &&
          !(!isTeamDashboardView && primarySidebarTab === "messages") ? (
            <HubRailWidgets
              currentProfile={currentProfile}
              activeUsers={activeUsers}
              groupConversations={groupConversations}
              latestMessageByConversationId={latestMessageByConversationId}
              dmConversationByUserId={dmConversationByUserId}
              totalXpByUserId={totalXpByUserId}
              onOpenDm={(userId) => void openDmConversation(userId)}
              onOpenGroup={openGroupConversation}
            />
          ) : null}

          {hideWorkspaceSidebarColumn && currentProfile ? (
            <div className="hub-rail-sign-out-footer">
              <button
                type="button"
                className="sidebar-sign-out-btn sidebar-sign-out-btn--on-light"
                onClick={() => void handleLogout()}
              >
                Sign out
              </button>
            </div>
          ) : null}
              </div>
        </>
      </aside>
      </div>

      {isTeamDashboardView && currentProfile && showIdentityBar
        ? createPortal(
            <div
              className="identity-bar-modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="teamchat-identity-dialog-title"
            >
              <button
                type="button"
                className="identity-bar-modal-backdrop"
                aria-label="Close identity settings"
                onClick={() => setShowIdentityBar(false)}
              />
              <div
                className="identity-bar-modal-sheet"
                onClick={(event) => event.stopPropagation()}
              >
                <IdentityBar
                  selectedPetId={selectedPetId}
                  selectedThemeColor={selectedThemeColor}
                  petOptions={PET_OPTIONS}
                  onPetChange={setSelectedPetId}
                  onThemeColorChange={setSelectedThemeColor}
                  onRequestClose={() => setShowIdentityBar(false)}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {currentProfile ? (
        <button
          type="button"
          className="updates-toggle-mobile"
          onClick={() => {
            if (isTeamDashboardView) {
              setPrimarySidebarTab("timeline");
            }
            setShowUpdatesPanel((existing) => !existing);
          }}
        >
          Panel
        </button>
      ) : null}

      {showGroupModal ? (
        <NewGroupModal
          users={activeUsers}
          availablePetIds={availablePetIds}
          isSubmitting={isCreatingGroup}
          onCancel={() => setShowGroupModal(false)}
          onCreate={handleCreateGroup}
          shellThemeStyle={appShellTheme}
        />
      ) : null}
      {showGroupInfoModal && activeConversation?.type === "group" && currentProfile ? (
        <GroupInfoModal
          group={activeConversation}
          members={activeMemberProfiles}
          currentUserId={currentProfile.id}
          availablePetIds={availablePetIds}
          canManageGroup={canManageActiveGroup}
          isSubmitting={isGroupActionSubmitting}
          onClose={() => setShowGroupInfoModal(false)}
          onOpenAddMembers={() => setShowAddMembersModal(true)}
          onRemoveMember={handleRemoveGroupMember}
          onDissolveGroup={handleDissolveGroup}
          shellThemeStyle={appShellTheme}
        />
      ) : null}
      {showAddMembersModal ? (
        <AddMembersModal
          candidates={addMemberCandidates}
          availablePetIds={availablePetIds}
          isSubmitting={isGroupActionSubmitting}
          onCancel={() => setShowAddMembersModal(false)}
          onConfirm={handleAddGroupMembers}
          shellThemeStyle={appShellTheme}
        />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat/:conversationId"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teamhub"
          element={
            <ProtectedRoute>
              <TeamHubHome />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
