import { useMemo, useState, type ReactNode } from "react";
import type { InternalProfile } from "../lib/authProfile";
import type { ChatMessage, ConversationSummary } from "../lib/chat";
import { getLevelProgress } from "../utils/xp";

export type HubRailWidgetsProps = {
  currentProfile: InternalProfile;
  activeUsers: InternalProfile[];
  groupConversations: ConversationSummary[];
  latestMessageByConversationId: Record<string, ChatMessage>;
  dmConversationByUserId: Record<string, string>;
  totalXpByUserId: Record<string, number>;
  onOpenDm: (userId: string) => void;
  onOpenGroup: (group: ConversationSummary) => void;
};

type ActivityRow = {
  conversationId: string;
  title: string;
  preview: string;
  createdAt: string;
  kind: "dm" | "group";
  dmPeerId?: string;
  group?: ConversationSummary;
};

const ACTIVITY_PREVIEW_MAX = 6;

function messagePreview(message: ChatMessage): string {
  const body = message.body?.trim();
  if (body) return body;
  if (message.message_type === "image") return "Image attachment";
  if (message.message_type === "file") return message.attachment_name || "File attachment";
  return "Message";
}

type HubCollapsibleSectionProps = {
  sectionId: string;
  titleId: string;
  title: ReactNode;
  caption: string;
  expanded: boolean;
  onToggle: () => void;
  widgetClass: string;
  children: ReactNode;
};

function HubCollapsibleSection({
  sectionId,
  titleId,
  title,
  caption,
  expanded,
  onToggle,
  widgetClass,
  children,
}: HubCollapsibleSectionProps) {
  const bodyId = `${sectionId}-body`;
  return (
    <section
      className={`hub-widget ${widgetClass}${expanded ? "" : " hub-widget--collapsed"}`.trim()}
      aria-labelledby={titleId}
    >
      <div className="hub-widget-header hub-widget-header--collapsible">
        <div className="hub-widget-header-text">
          <h4 id={titleId} className="hub-widget-title">
            {title}
          </h4>
          <span className="hub-widget-caption">{caption}</span>
        </div>
        <button
          type="button"
          className="hub-widget-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          title={expanded ? "Minimize section" : "Expand section"}
        >
          <span className="hub-widget-toggle-icon" aria-hidden>
            {expanded ? "−" : "+"}
          </span>
        </button>
      </div>
      <div id={bodyId} className="hub-widget-body" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}

export function HubRailWidgets({
  currentProfile,
  activeUsers,
  groupConversations,
  latestMessageByConversationId,
  dmConversationByUserId,
  totalXpByUserId,
  onOpenDm,
  onOpenGroup,
}: HubRailWidgetsProps) {
  /* Only activity + leaderboard: start expanded so the rail is useful at a glance */
  const [activityExpanded, setActivityExpanded] = useState(true);
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(true);
  /** When true, Team activity shows every row; when false, only the first six rows. */
  const [activityShowAllRows, setActivityShowAllRows] = useState(false);

  const profileById = useMemo(() => {
    const map = new Map<string, InternalProfile>();
    map.set(currentProfile.id, currentProfile);
    for (const u of activeUsers) {
      map.set(u.id, u);
    }
    return map;
  }, [activeUsers, currentProfile]);

  const userIdByDmConversationId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [userId, convId] of Object.entries(dmConversationByUserId)) {
      map.set(convId, userId);
    }
    return map;
  }, [dmConversationByUserId]);

  const activityRows = useMemo((): ActivityRow[] => {
    const rows: ActivityRow[] = [];
    const groupById = new Map(groupConversations.map((g) => [g.id, g]));

    for (const [conversationId, message] of Object.entries(latestMessageByConversationId)) {
      if (!message?.created_at) continue;

      const group = groupById.get(conversationId);
      if (group) {
        rows.push({
          conversationId,
          title: group.title || "Group",
          preview: messagePreview(message),
          createdAt: message.created_at,
          kind: "group",
          group,
        });
        continue;
      }

      const peerId = userIdByDmConversationId.get(conversationId);
      if (peerId) {
        const peer = profileById.get(peerId);
        rows.push({
          conversationId,
          title: peer?.display_name ?? "Direct message",
          preview: messagePreview(message),
          createdAt: message.created_at,
          kind: "dm",
          dmPeerId: peerId,
        });
      }
    }

    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  }, [groupConversations, latestMessageByConversationId, profileById, userIdByDmConversationId]);

  const leaderboard = useMemo(() => {
    const all = [currentProfile, ...activeUsers.filter((u) => u.id !== currentProfile.id)];
    const ranked = [...all].sort(
      (a, b) => (totalXpByUserId[b.id] ?? 0) - (totalXpByUserId[a.id] ?? 0)
    );
    return ranked.slice(0, 6);
  }, [activeUsers, currentProfile, totalXpByUserId]);

  const activityHasOverflow = activityRows.length > ACTIVITY_PREVIEW_MAX;
  const activityOthersCount = activityRows.length - ACTIVITY_PREVIEW_MAX;
  const activityVisibleRows =
    activityShowAllRows || !activityHasOverflow ? activityRows : activityRows.slice(0, ACTIVITY_PREVIEW_MAX);

  return (
    <div className="hub-rail-widgets">
      <HubCollapsibleSection
        sectionId="hub-activity"
        titleId="hub-activity-heading"
        title="Team activity"
        caption="Latest across chats"
        expanded={activityExpanded}
        onToggle={() => setActivityExpanded((v) => !v)}
        widgetClass="hub-widget--activity"
      >
        {activityRows.length === 0 ? (
          <p className="hub-widget-empty">No messages yet. Open a chat to get started.</p>
        ) : (
          <ul
            className={`hub-activity-list${activityHasOverflow && !activityShowAllRows ? " hub-activity-list--truncated" : ""}`.trim()}
          >
            {activityVisibleRows.map((row) => (
              <li key={row.conversationId}>
                <button
                  type="button"
                  className="hub-activity-row"
                  onClick={() => {
                    if (row.kind === "group" && row.group) {
                      onOpenGroup(row.group);
                    } else if (row.dmPeerId) {
                      onOpenDm(row.dmPeerId);
                    }
                  }}
                >
                  <span className="hub-activity-main">
                    <span className="hub-activity-title">{row.title}</span>
                    <span className="hub-activity-preview">{row.preview}</span>
                  </span>
                  <time className="hub-activity-time" dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </button>
              </li>
            ))}
            {activityHasOverflow && !activityShowAllRows ? (
              <li className="hub-activity-others-li">
                <button
                  type="button"
                  className="hub-activity-others-row"
                  aria-expanded={false}
                  aria-label={`Show ${activityOthersCount} more conversations`}
                  onClick={() => setActivityShowAllRows(true)}
                >
                  <span className="hub-activity-others-label">Others ({activityOthersCount})</span>
                  <span className="hub-activity-others-chevron" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ) : null}
            {activityHasOverflow && activityShowAllRows ? (
              <li className="hub-activity-others-li">
                <button
                  type="button"
                  className="hub-activity-others-row hub-activity-others-row--collapse"
                  aria-expanded={true}
                  onClick={() => setActivityShowAllRows(false)}
                >
                  <span className="hub-activity-others-label">Show fewer</span>
                  <span className="hub-activity-others-chevron hub-activity-others-chevron--up" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </HubCollapsibleSection>

      <HubCollapsibleSection
        sectionId="hub-leaderboard"
        titleId="hub-xp-heading"
        title="XP leaderboard"
        caption="Top teammates this season"
        expanded={leaderboardExpanded}
        onToggle={() => setLeaderboardExpanded((v) => !v)}
        widgetClass="hub-widget--leaderboard"
      >
        <ol className="hub-leader-list">
          {leaderboard.map((profile, index) => {
            const xp = totalXpByUserId[profile.id] ?? 0;
            const { level, progressPercent } = getLevelProgress(xp);
            const pct = Math.min(100, Math.max(0, progressPercent));
            return (
              <li key={profile.id} className="hub-leader-row">
                <span className="hub-leader-rank" aria-hidden>
                  {index + 1}
                </span>
                <div className="hub-leader-body">
                  <div className="hub-leader-name-row">
                    <span className="hub-leader-name">{profile.display_name}</span>
                    <span className="hub-leader-level">Lv.{level}</span>
                  </div>
                  <div className="hub-leader-track" aria-hidden>
                    <span className="hub-leader-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="hub-leader-xp">{xp.toLocaleString()} XP</span>
                </div>
              </li>
            );
          })}
        </ol>
      </HubCollapsibleSection>
    </div>
  );
}
