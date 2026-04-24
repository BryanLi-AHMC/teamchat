import { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { getCurrentInternalProfile, type InternalProfile } from "./lib/authProfile";
import {
  createGroupConversation,
  getActiveTeammates,
  getConversationById,
  getConversationMembers,
  getDmConversationMapForUser,
  getGroupConversationsForUser,
  getMessages,
  getOrCreateDmConversation,
  sendMessage,
  type ChatMessage,
  type ConversationMember,
  type ConversationSummary,
} from "./lib/chat";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import "./App.css";

type NewGroupModalProps = {
  users: InternalProfile[];
  isSubmitting: boolean;
  onCancel: () => void;
  onCreate: (title: string, selectedUserIds: string[]) => Promise<void>;
};

function NewGroupModal({ users, isSubmitting, onCancel, onCreate }: NewGroupModalProps) {
  const [groupTitle, setGroupTitle] = useState("");
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

    if (!groupTitle.trim()) {
      setError("Please provide a group name.");
      return;
    }

    if (selectedUserIds.length === 0) {
      setError("Select at least one teammate.");
      return;
    }

    try {
      await onCreate(groupTitle, selectedUserIds);
      setGroupTitle("");
      setSelectedUserIds([]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create group.");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Create group chat">
        <h3>New Group Chat</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <label htmlFor="group-title">Group name</label>
          <input
            id="group-title"
            type="text"
            placeholder="e.g. Product + Engineering"
            value={groupTitle}
            onChange={(event) => setGroupTitle(event.target.value)}
            maxLength={80}
          />

          <p className="modal-helper">Select team members</p>
          <div className="member-options">
            {users.map((user) => (
              <label key={user.id} className="member-option">
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleMember(user.id)}
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
              {isSubmitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MainLayout() {
  const EMOJIS = ["😀", "😄", "😂", "👍", "🙏", "❤️", "🎉", "✅", "👀", "😭", "😅", "🔥", "💪", "👏", "🚀"];
  const [currentProfile, setCurrentProfile] = useState<InternalProfile | null>(null);
  const [activeUsers, setActiveUsers] = useState<InternalProfile[]>([]);
  const [groupConversations, setGroupConversations] = useState<ConversationSummary[]>([]);
  const [dmConversationByUserId, setDmConversationByUserId] = useState<Record<string, string>>({});
  const [unreadByConversationId, setUnreadByConversationId] = useState<Record<string, number>>({});
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [activeConversationMembers, setActiveConversationMembers] = useState<ConversationMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState("");
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [chatError, setChatError] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);

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
    if (!currentProfile?.id) {
      return;
    }

    const channel = supabase
      .channel(`messages:for-user:${currentProfile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as ChatMessage;
          const isOpenConversation = message.conversation_id === activeConversation?.id;

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

          const knownDmConversationId = dmConversationByUserId[message.sender_id];
          if (!knownDmConversationId && message.sender_id !== currentProfile.id) {
            void getConversationById(message.conversation_id)
              .then((conversation) => {
                if (conversation.type !== "dm") {
                  return;
                }
                return getConversationMembers(message.conversation_id);
              })
              .then((members) => {
                if (!members) {
                  return;
                }
                const otherMember = members.find((member) => member.user_id !== currentProfile.id);
                if (!otherMember) {
                  return;
                }
                setDmConversationByUserId((existing) => ({
                  ...existing,
                  [otherMember.user_id]: message.conversation_id,
                }));
              })
              .catch(() => {
                // Non-blocking: unread logic still works by conversation id.
              });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversation?.id, currentProfile?.id, dmConversationByUserId]);

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

  const refreshGroups = async () => {
    if (!currentProfile) {
      return;
    }
    const groups = await getGroupConversationsForUser(currentProfile.id);
    setGroupConversations(groups);
  };

  const openDmConversation = async (targetUserId: string) => {
    try {
      setChatError("");
      const conversationId = await getOrCreateDmConversation(targetUserId);
      setUnreadByConversationId((existing) => ({ ...existing, [conversationId]: 0 }));
      setDmConversationByUserId((existing) => ({ ...existing, [targetUserId]: conversationId }));
      setActiveConversation(await getConversationById(conversationId));
      await refreshGroups();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to open direct message.");
    }
  };

  const openGroupConversation = async (conversation: ConversationSummary) => {
    setUnreadByConversationId((existing) => ({ ...existing, [conversation.id]: 0 }));
    setActiveConversation(conversation);
    setChatError("");
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
      const createdMessage = await sendMessage(activeConversation.id, composerText);
      setMessages((existing) => {
        if (existing.some((message) => message.id === createdMessage.id)) {
          return existing;
        }
        return [...existing, createdMessage];
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

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
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

  // TODO: Persist unread counts with server-backed read receipts per user/conversation.

  if (isInitializing) {
    return <div className="route-loading">Loading TeamChat...</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1 className="app-title">TeamChat</h1>
          <p className="subtitle">{currentProfile?.display_name ?? "Internal user"}</p>
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
                  <button
                    type="button"
                    className={`sidebar-item ${activeConversation?.id === dmConversationByUserId[user.id] ? "sidebar-item-active" : ""}`}
                    onClick={() => void openDmConversation(user.id)}
                  >
                    <span>{user.display_name}</span>
                    {(unreadByConversationId[dmConversationByUserId[user.id]] ?? 0) > 0 ? (
                      <span className="unread-badge">{unreadByConversationId[dmConversationByUserId[user.id]]}</span>
                    ) : null}
                  </button>
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
                  <button
                    type="button"
                    className={`sidebar-item ${activeConversation?.id === group.id ? "sidebar-item-active" : ""}`}
                    onClick={() => void openGroupConversation(group)}
                  >
                    <span>{group.title || "Untitled group"}</span>
                    {(unreadByConversationId[group.id] ?? 0) > 0 ? (
                      <span className="unread-badge">{unreadByConversationId[group.id]}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </nav>
      </aside>

      <main className="chat-panel">
        <header className="panel-header">
          <h2>{activeConversationTitle}</h2>
        </header>

        <div className="message-list">
          {messages.map((message) => (
            <article key={message.id} className="message-item">
              <div className="message-meta">
                <strong>{profileById.get(message.sender_id)?.display_name ?? "Unknown sender"}</strong>
                <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="message-body">{message.body}</p>
            </article>
          ))}
          {messages.length === 0 ? (
            <p className="empty-state">No messages yet. Start the conversation.</p>
          ) : null}
        </div>

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
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={!activeConversation}
          />
          </div>
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
            disabled={!activeConversation || isSending || !composerText.trim()}
          >
            Send
          </button>
        </footer>
        <p className="chat-error" role="alert">
          {chatError}
        </p>
      </main>

      {showGroupModal ? (
        <NewGroupModal
          users={activeUsers}
          isSubmitting={isCreatingGroup}
          onCancel={() => setShowGroupModal(false)}
          onCreate={handleCreateGroup}
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
