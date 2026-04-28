import {
  ChangeEvent,
  type CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  getMessages,
  getOrCreateDmConversation,
  removeGroupMember,
  toChatMessageFromSocket,
  type ChatMessage,
  type ConversationMember,
  type ConversationSummary,
} from "./lib/chat";
import { createMyUpdate, deleteMyUpdate, fetchUpdatesForUser, type UserUpdate } from "./lib/updates";
import { createTypingChannel, subscribeToTeamPresence } from "./lib/presence";
import { disconnectSocketClient, getSocketClient } from "./lib/socket";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import TeamHubHome from "./pages/TeamHubHome";
import { PetAvatar } from "./components/PetAvatar";
import { IdentityBar } from "./components/IdentityBar";
import { TeamPetDashboard } from "./components/TeamPetDashboard";
import { CurrentUserPlayerCard } from "./components/CurrentUserPlayerCard";
import { PET_OPTIONS, isValidPetId } from "./constants/pets";
import { getThemeCssVars, readStoredThemeId, TEAMCHAT_SELECTED_THEME_STORAGE_KEY } from "./utils/theme";
import { getAssignedPetIdForUser, resolvePetIdForProfile } from "./utils/petAssignment";
import { getDailyUpdateStreak, readStoredUserTotalXp, tryAwardDailyUpdateXp } from "./utils/userXp";
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
};

type AddMembersModalProps = {
  candidates: InternalProfile[];
  availablePetIds: string[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (selectedUserIds: string[]) => Promise<void>;
};

function NewGroupModal({ users, availablePetIds, isSubmitting, onCancel, onCreate }: NewGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    console.log("groupName", groupName, "selectedMemberIds", selectedMemberIds);
  }, [groupName, selectedMemberIds]);

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
    <div className="modal-backdrop" role="presentation">
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

function AddMembersModal({ candidates, availablePetIds, isSubmitting, onCancel, onConfirm }: AddMembersModalProps) {
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
    <div className="modal-backdrop" role="presentation">
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
}: GroupInfoModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
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

function getDateKey(isoDate: string) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimelineDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dateKey === getDateKey(today.toISOString())) {
    return "Today";
  }
  if (dateKey === getDateKey(yesterday.toISOString())) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const [composerText, setComposerText] = useState("");
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentUrlByPath, setAttachmentUrlByPath] = useState<Record<string, string>>({});
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [searchText, setSearchText] = useState("");
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
  const [currentUserTotalXp, setCurrentUserTotalXp] = useState(0);
  const [levelUpToast, setLevelUpToast] = useState<string | null>(null);
  const [showUpdatesPanel, setShowUpdatesPanel] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [restoredConversationId, setRestoredConversationId] = useState<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const hasCompletedInitialLoadRef = useRef(false);
  const typingChannelRef = useRef<ReturnType<typeof createTypingChannel> | null>(null);
  const typingIdleTimerRef = useRef<number | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocketClient> | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

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
    if (!currentProfile?.id) {
      return;
    }
    setCurrentUserTotalXp(readStoredUserTotalXp(currentProfile.id));
  }, [currentProfile?.id]);

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

        setCurrentProfile(profile);
        setActiveUsers(teammates.filter((user) => user.id !== profile.id));
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
            const { [nextPayload.userId!]: _, ...restTyping } = currentConversationTyping;
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
      await openDmConversation(targetUserId);
      setRestoredConversationId(conversationIdFromRoute);
      return true;
    };

    void openKnownDm()
      .then((opened) => {
        if (opened) {
          return;
        }
        setActiveConversation(null);
        setActiveConversationMembers([]);
        setMessages([]);
        setRestoredConversationId(null);
        navigate("/", { replace: true });
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
          getMessages(activeConversation.id),
        ]);

        if (!isMounted) {
          return;
        }

        setActiveConversation(conversation);
        setActiveConversationMembers(members);
        setMessages(initialMessages);
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

  useEffect(() => {
    if (!currentProfile?.id) {
      return;
    }

    let cancelled = false;

    const onMessageNew = (incomingPayload: Parameters<typeof toChatMessageFromSocket>[0]) => {
      const message = toChatMessageFromSocket(incomingPayload);
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
      } else if (message.sender_id !== currentProfile.id) {
        setUnreadByConversationId((existing) => ({
          ...existing,
          [message.conversation_id]: (existing[message.conversation_id] ?? 0) + 1,
        }));
      }
    };

    const onMessageError = (errorPayload: { message: string }) => {
      if (cancelled) {
        return;
      }
      setChatError(errorPayload.message || "Message failed.");
    };

    const bindSocketListeners = (nextSocket: ReturnType<typeof getSocketClient>) => {
      const previousSocket = socketRef.current;
      if (previousSocket && previousSocket !== nextSocket) {
        previousSocket.off("message:new", onMessageNew);
        previousSocket.off("message:error", onMessageError);
      }
      if (!nextSocket) {
        socketRef.current = null;
        return;
      }
      nextSocket.off("message:new", onMessageNew);
      nextSocket.off("message:error", onMessageError);
      nextSocket.on("message:new", onMessageNew);
      nextSocket.on("message:error", onMessageError);
      if (activeConversationIdRef.current) {
        nextSocket.emit("conversation:join", { conversationId: activeConversationIdRef.current });
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

      console.log("[socket] session token exists", {
        hasToken: Boolean(accessToken),
        tokenPrefix: accessToken.slice(0, 12),
        socketUrl: import.meta.env.VITE_SOCKET_URL || "http://localhost:3003",
      });

      const nextSocket = getSocketClient(accessToken);
      bindSocketListeners(nextSocket);
    };

    void connectSocket();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) {
        const existingSocket = socketRef.current;
        if (existingSocket) {
          existingSocket.off("message:new", onMessageNew);
          existingSocket.off("message:error", onMessageError);
        }
        disconnectSocketClient();
        socketRef.current = null;
        return;
      }

      console.log("[socket] session token exists", {
        hasToken: Boolean(session.access_token),
        tokenPrefix: session.access_token.slice(0, 12),
        socketUrl: import.meta.env.VITE_SOCKET_URL || "http://localhost:3003",
      });
      const nextSocket = getSocketClient(session.access_token);
      bindSocketListeners(nextSocket);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      const existingSocket = socketRef.current;
      if (existingSocket) {
        existingSocket.off("message:new", onMessageNew);
        existingSocket.off("message:error", onMessageError);
      }
      disconnectSocketClient();
      socketRef.current = null;
    };
  }, [currentProfile?.id]);

  useEffect(() => {
    const socket = socketRef.current;
    const previousConversationId = activeConversationIdRef.current;
    const nextConversationId = activeConversation?.id ?? null;
    if (!socket) {
      activeConversationIdRef.current = nextConversationId;
      return;
    }

    if (previousConversationId && previousConversationId !== nextConversationId) {
      socket.emit("conversation:leave", { conversationId: previousConversationId });
    }
    if (nextConversationId) {
      socket.emit("conversation:join", { conversationId: nextConversationId });
    }

    activeConversationIdRef.current = nextConversationId;
  }, [activeConversation?.id]);

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

  const filteredDmUsers = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return activeUsers;
    }
    return activeUsers.filter(
      (user) =>
        user.display_name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    );
  }, [activeUsers, searchText]);

  const filteredGroups = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return groupConversations;
    }
    return groupConversations.filter((group) => (group.title ?? "Untitled group").toLowerCase().includes(query));
  }, [groupConversations, searchText]);

  const selectedUpdatesProfile = useMemo(() => {
    if (!selectedUpdatesUserId) {
      return currentProfile;
    }
    return profileById.get(selectedUpdatesUserId) ?? currentProfile;
  }, [currentProfile, profileById, selectedUpdatesUserId]);

  const totalXpByUserId = useMemo(() => {
    const map: Record<string, number> = {};
    if (currentProfile?.id) {
      map[currentProfile.id] = currentUserTotalXp;
    }
    for (const user of activeUsers) {
      map[user.id] = readStoredUserTotalXp(user.id);
    }
    return map;
  }, [activeUsers, currentProfile?.id, currentUserTotalXp]);

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

  const myUpdatesCount = currentProfile ? (updatesByUserId[currentProfile.id]?.length ?? 0) : 0;

  const currentUserDayStreak = useMemo(
    () => (currentProfile ? getDailyUpdateStreak(currentProfile.id) : 0),
    [currentProfile?.id, myUpdatesCount, currentUserTotalXp]
  );

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
      const key = getDateKey(update.created_at);
      const existing = grouped.get(key) ?? [];
      existing.push(update);
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => (a > b ? -1 : 1));
  }, [selectedUpdates]);

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

  const goToDashboard = () => {
    setActiveConversation(null);
    setActiveConversationMembers([]);
    setMessages([]);
    setChatError("");
    navigate("/", { replace: true });
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
      const todayKey = getDateKey(created.created_at);
      setExpandedDatesByUserId((existing) => ({
        ...existing,
        [currentProfile.id]: {
          ...(existing[currentProfile.id] ?? {}),
          [todayKey]: true,
        },
      }));
      const xpResult = tryAwardDailyUpdateXp(currentProfile.id);
      if (xpResult.awarded) {
        setCurrentUserTotalXp(xpResult.newTotal);
        if (xpResult.levelAfter > xpResult.levelBefore) {
          setLevelUpToast(`Level up! You reached Lv. ${xpResult.levelAfter}`);
        }
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

  const handleJumpToDate = (dateKey: string) => {
    if (!selectedUpdatesUserId) {
      return;
    }
    setExpandedDatesByUserId((existing) => ({
      ...existing,
      [selectedUpdatesUserId]: {
        ...(existing[selectedUpdatesUserId] ?? {}),
        [dateKey]: true,
      },
    }));
    setShowDatePicker(false);
    requestAnimationFrame(() => {
      const root = timelineScrollRef.current;
      const target = root?.querySelector<HTMLElement>(`[data-date-key="${dateKey}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  const handleSend = async (event?: FormEvent<HTMLFormElement> | ReactMouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();

    console.log("[handleSend]", {
      activeConversationId: activeConversation?.id,
      body: composerText,
    });

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
      const socket = socketRef.current;
      if (!socket) {
        throw new Error("Realtime connection unavailable.");
      }
      socket.emit("message:send", {
        conversationId: activeConversation.id,
        body: composerText.trim(),
        messageType: "text",
      });
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

      const socket = socketRef.current;
      if (!socket) {
        throw new Error("Realtime connection unavailable.");
      }
      socket.emit("message:send", {
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
    if (!showDatePicker) {
      return;
    }
    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".updates-calendar-wrap")) {
        return;
      }
      setShowDatePicker(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showDatePicker]);

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

  // TODO: Persist unread counts with server-backed read receipts per user/conversation.

  if (isInitializing) {
    return <div className="route-loading">Loading TeamChat...</div>;
  }

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
        <div className="sidebar-body-scroll">
          <div className="sidebar-brand">
            <h1 className="app-title">TeamChat</h1>
          </div>

          <input
            className="sidebar-search"
            type="text"
            placeholder="Search teammates or groups"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

          <nav className="sidebar-sections">
          <section>
            <h2>Direct Messages</h2>
            <ul>
              {filteredDmUsers.map((user) => (
                <li key={user.id}>
                  {(() => {
                    const dmConversationId = dmConversationByUserId[user.id];
                    const unreadCount = unreadByConversationId[dmConversationId] ?? 0;
                    const latestMessage = dmConversationId ? latestMessageByConversationId[dmConversationId] : undefined;
                    const preview =
                      latestMessage?.body?.trim() ||
                      (latestMessage?.message_type === "image"
                        ? "Image attachment"
                        : latestMessage?.message_type === "file"
                          ? latestMessage.attachment_name || "File attachment"
                          : "");
                    return (
                  <button
                    type="button"
                    className={`sidebar-item ${activeConversation?.id === dmConversationId ? "sidebar-item-active" : ""}`}
                    onClick={() => void openDmConversation(user.id)}
                  >
                    <span className="sidebar-item-main">
                      <span role="button" onClick={(event) => {
                        event.stopPropagation();
                        handleViewUpdatesProfile(user.id);
                      }}>{renderPresencePetAvatar(user, "md")}</span>
                      <span className="sidebar-item-text-wrap">
                        <span
                          className="sidebar-item-name"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleViewUpdatesProfile(user.id);
                          }}
                        >
                          {user.display_name}
                        </span>
                        <span className="sidebar-item-preview">
                          {preview ? preview : "No messages yet"}
                        </span>
                      </span>
                    </span>
                    {unreadCount > 0 ? (
                      <span className="unread-badge">{formatUnreadCount(unreadCount)}</span>
                    ) : null}
                  </button>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="section-header-row">
              <h2>Group Chats</h2>
              <button type="button" className="new-group-button" onClick={() => setShowGroupModal(true)}>
                + New Group
              </button>
            </div>
            <ul>
              {filteredGroups.map((group) => (
                <li key={group.id}>
                  {(() => {
                    const unreadCount = unreadByConversationId[group.id] ?? 0;
                    const latestMessage = latestMessageByConversationId[group.id];
                    const preview =
                      latestMessage?.body?.trim() ||
                      (latestMessage?.message_type === "image"
                        ? "Image attachment"
                        : latestMessage?.message_type === "file"
                          ? latestMessage.attachment_name || "File attachment"
                          : "");
                    return (
                  <button
                    type="button"
                    className={`sidebar-item ${activeConversation?.id === group.id ? "sidebar-item-active" : ""}`}
                    onClick={() => void openGroupConversation(group)}
                  >
                    <span className="sidebar-item-main">
                      <span className="avatar avatar-sm avatar-group" aria-hidden="true">
                        {(group.title || "Group").slice(0, 1).toUpperCase()}
                      </span>
                      <span className="sidebar-item-text-wrap">
                        <span className="sidebar-item-name">{group.title || "Untitled group"}</span>
                        <span className="sidebar-item-preview">{preview ? preview : "No messages yet"}</span>
                      </span>
                    </span>
                    {unreadCount > 0 ? (
                      <span className="unread-badge">{formatUnreadCount(unreadCount)}</span>
                    ) : null}
                  </button>
                    );
                  })()}
                </li>
              ))}
            </ul>
          </section>
        </nav>
        </div>

        {currentProfile ? (
          <div className="sidebar-player-card-slot">
            <CurrentUserPlayerCard
              displayName={currentProfile.display_name}
              imageUrl={currentProfile.avatar_url}
              selectedPetId={selectedPetId}
              totalXp={currentUserTotalXp}
              isOnline
              roleLabel={currentUserRoleLabel}
              dayStreak={currentUserDayStreak}
              onOpenProfile={() => void handleViewUpdatesProfile(currentProfile.id)}
            />
          </div>
        ) : null}
      </aside>

      <main className="chat-panel center-column">
        <div className="chat-panel-inner center-content-inner">
          <div className="chat-panel-body">
          {!activeConversation && currentProfile ? (
            <TeamPetDashboard
              currentUser={currentProfile}
              teammates={activeUsers}
              currentUserPetId={selectedPetId}
              availablePetIds={availablePetIds}
              onlineUserIds={onlineUserIds}
              dmConversationByUserId={dmConversationByUserId}
              unreadByConversationId={unreadByConversationId}
              totalXpByUserId={totalXpByUserId}
              onBackToDashboard={goToDashboard}
              onLogout={() => void handleLogout()}
              onToggleUpdates={() => setShowUpdatesPanel((existing) => !existing)}
              onOpenTeammateDm={(userId) => void openDmConversation(userId)}
            />
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
            <div className="panel-header-actions">
              <button type="button" className="back-to-dashboard-button" onClick={goToDashboard}>
                Back to Dashboard
              </button>
            {activeConversation.type === "group" ? (
              <button type="button" className="group-info-button" onClick={handleOpenGroupInfo}>
                Group Info
              </button>
            ) : null}
            </div>
          </header>

          <div className="message-list">
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
                      <span className="message-time">
                        {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
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
          <p className="chat-error" role="alert">
            {chatError}
          </p>
          </div>

          {isTeamDashboardView && currentProfile ? (
            <IdentityBar
              selectedPetId={selectedPetId}
              selectedThemeColor={selectedThemeColor}
              petOptions={PET_OPTIONS}
              onPetChange={setSelectedPetId}
              onThemeColorChange={setSelectedThemeColor}
            />
          ) : null}

          {activeConversation ? (
          <footer className="chat-input-bar">
            <div className="composer-wrapper">
              {showEmojiMenu ? (
                <div className="emoji-menu" ref={emojiMenuRef}>
                  {EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" className="emoji-menu-item" onClick={() => handleSelectEmoji(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={composerRef}
                placeholder="Type a message..."
                value={composerText}
                onChange={(event) => handleComposerChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={!activeConversation}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="attachment-input"
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleAttachmentSelect}
              />
            </div>
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
            <button
              type="button"
              className="emoji-toggle"
              onClick={() => setShowEmojiMenu((existing) => !existing)}
              disabled={!activeConversation}
              aria-label="Open emoji picker"
            >
              🙂
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!activeConversation || isSending || isUploadingAttachment || !composerText.trim()}
            >
              Send
            </button>
          </footer>
          ) : null}
        </div>
      </main>

      <aside className={`right-panel updates-panel ${showUpdatesPanel ? "updates-panel-open" : ""}`}>
        <header className="updates-header">
          <div className="updates-header-profile-block">
            <h3>Daily Updates</h3>
            {selectedUpdatesProfile ? (
              <div className="updates-header-profile-row">
                <button
                  type="button"
                  className="updates-profile-chip"
                  onClick={() => selectedUpdatesProfile?.id && handleViewUpdatesProfile(selectedUpdatesProfile.id)}
                >
                  {renderPresencePetAvatar(selectedUpdatesProfile, "md")}
                  <span>{selectedUpdatesProfile.display_name}</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="updates-calendar-wrap">
            <button
              type="button"
              className="calendar-button"
              aria-label="Choose timeline date"
              onClick={() => setShowDatePicker((existing) => !existing)}
            >
              📅
            </button>
            {showDatePicker ? (
              <div className="updates-date-dropdown">
                {groupedUpdates.length === 0 ? (
                  <p>No dates yet</p>
                ) : (
                  groupedUpdates.map(([dateKey]) => (
                    <button key={dateKey} type="button" onClick={() => handleJumpToDate(dateKey)}>
                      {formatTimelineDateLabel(dateKey)}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </header>

        {selectedUpdatesUserId === currentProfile?.id ? (
          <div className="updates-composer">
            <textarea
              placeholder="Share an update..."
              value={timelineInput}
              onChange={(event) => setTimelineInput(event.target.value)}
              rows={3}
            />
            <button type="button" onClick={() => void handlePostUpdate()} disabled={isPostingUpdate || !timelineInput.trim()}>
              {isPostingUpdate ? "Updating..." : "Update"}
            </button>
          </div>
        ) : null}

        <div className="updates-timeline" ref={timelineScrollRef}>
          {timelineLoading ? <p className="empty-state">Loading updates...</p> : null}
          {!timelineLoading && groupedUpdates.length === 0 ? (
            <p className="empty-state">No updates yet for this profile.</p>
          ) : null}
          {groupedUpdates.map(([dateKey, dateUpdates], groupIndex) => {
            const explicitState = (expandedDatesByUserId[selectedUpdatesUserId ?? ""] ?? {})[dateKey];
            const isExpanded = explicitState ?? groupIndex < 2;
            return (
              <section key={dateKey} data-date-key={dateKey} className="timeline-date-group">
                <button type="button" className="timeline-date-toggle" onClick={() => toggleDateGroup(dateKey)}>
                  <span>{formatTimelineDateLabel(dateKey)}</span>
                  <span>{isExpanded ? "−" : "+"}</span>
                </button>
                {isExpanded ? (
                  <div className="timeline-date-items">
                    {dateUpdates.map((update) => {
                      const expanded = expandedUpdateIds.has(update.id);
                      const isLong = update.body.length > 160 || update.body.includes("\n");
                      return (
                        <article key={update.id} className="timeline-item">
                          <div className="timeline-time">
                            <span>{new Date(update.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                            <span>{new Date(update.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <div className="timeline-axis" aria-hidden="true">
                            <span className="timeline-dot" />
                            <span className="timeline-line" />
                          </div>
                          <div className="timeline-content">
                            <p className={expanded ? "timeline-body" : "timeline-body timeline-body-clamped"}>{update.body}</p>
                            <div className="timeline-actions">
                              {isLong ? (
                                <button
                                  type="button"
                                  className="timeline-expand"
                                  onClick={() =>
                                    setExpandedUpdateIds((existing) => {
                                      const next = new Set(existing);
                                      if (next.has(update.id)) {
                                        next.delete(update.id);
                                      } else {
                                        next.add(update.id);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  {expanded ? "Show less" : "Show more"}
                                </button>
                              ) : (
                                <span />
                              )}
                              {update.user_id === currentProfile?.id ? (
                                <button
                                  type="button"
                                  className="timeline-delete"
                                  aria-label="Delete update"
                                  onClick={() => void handleDeleteUpdate(update.id)}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
        <p className="chat-error" role="alert">
          {timelineError}
        </p>
      </aside>
    </div>

      {!isTeamDashboardView ? (
        <button type="button" className="updates-toggle-mobile" onClick={() => setShowUpdatesPanel((existing) => !existing)}>
          Updates
        </button>
      ) : null}

      {showGroupModal ? (
        <NewGroupModal
          users={activeUsers}
          availablePetIds={availablePetIds}
          isSubmitting={isCreatingGroup}
          onCancel={() => setShowGroupModal(false)}
          onCreate={handleCreateGroup}
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
        />
      ) : null}
      {showAddMembersModal ? (
        <AddMembersModal
          candidates={addMemberCandidates}
          availablePetIds={availablePetIds}
          isSubmitting={isGroupActionSubmitting}
          onCancel={() => setShowAddMembersModal(false)}
          onConfirm={handleAddGroupMembers}
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
