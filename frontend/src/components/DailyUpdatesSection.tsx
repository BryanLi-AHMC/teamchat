import type { RefObject, ReactNode } from "react";
import type { InternalProfile } from "../lib/authProfile";
import { userUpdateDisplayAtIso, type UserUpdate } from "../lib/updates";
import { formatTimelineDateLabel } from "../utils/timelineDates";

export type DailyUpdatesSectionProps = {
  variant: "hub" | "timeline";
  /** When false, the card stays fully open (no ± control). Used on Home above Team activity. */
  collapsible?: boolean;
  /** Chat rail: hide third column. Omitted in timeline sidebar. */
  onHideRail?: () => void;
  timelineScrollRef: RefObject<HTMLDivElement | null>;
  currentProfile: InternalProfile | null;
  selectedUpdatesUserId: string | null;
  selectedUpdatesProfile: InternalProfile | null | undefined;
  timelineInput: string;
  onTimelineInputChange: (value: string) => void;
  timelineLoading: boolean;
  timelineError: string;
  groupedUpdates: [string, UserUpdate[]][];
  expandedDatesForUser: Record<string, boolean>;
  onToggleDateGroup: (dateKey: string) => void;
  expandedUpdateIds: Set<string>;
  onToggleExpandedUpdate: (updateId: string) => void;
  onDeleteUpdate: (updateId: string) => void;
  isPostingUpdate: boolean;
  onPostUpdate: () => void;
  hubDailyExpanded: boolean;
  onHubDailyExpandedToggle: () => void;
  onViewUpdatesProfile: (userId: string) => void;
  renderPresencePetAvatar: (
    profile: InternalProfile | undefined,
    size: "xs" | "sm" | "md" | "lg" | "xl",
    extraClass?: string
  ) => ReactNode;
};

export function DailyUpdatesSection({
  variant,
  collapsible = true,
  onHideRail,
  timelineScrollRef,
  currentProfile,
  selectedUpdatesUserId,
  selectedUpdatesProfile,
  timelineInput,
  onTimelineInputChange,
  timelineLoading,
  timelineError,
  groupedUpdates,
  expandedDatesForUser,
  onToggleDateGroup,
  expandedUpdateIds,
  onToggleExpandedUpdate,
  onDeleteUpdate,
  isPostingUpdate,
  onPostUpdate,
  hubDailyExpanded,
  onHubDailyExpandedToggle,
  onViewUpdatesProfile,
  renderPresencePetAvatar,
}: DailyUpdatesSectionProps) {
  const isTimeline = variant === "timeline";
  const canCollapse = collapsible;

  const sectionClass = [
    "hub-daily-card",
    canCollapse && !hubDailyExpanded ? "hub-daily-card--collapsed" : "",
    isTimeline ? "hub-daily-card--timeline-sidebar" : "",
    !canCollapse && !isTimeline ? "hub-daily-card--pinned-home" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={sectionClass} aria-labelledby="hub-daily-title">
      <header className="updates-header hub-daily-card__header">
        <div className="updates-header-profile-block">
          <span className="hub-daily-eyebrow">Today</span>
          <h3 id="hub-daily-title">{canCollapse ? "Daily Updates" : "Your daily updates"}</h3>
          {canCollapse && selectedUpdatesProfile ? (
            <div className="updates-header-profile-row">
              <button
                type="button"
                className="updates-profile-chip"
                onClick={() => selectedUpdatesProfile?.id && onViewUpdatesProfile(selectedUpdatesProfile.id)}
              >
                {renderPresencePetAvatar(selectedUpdatesProfile, "md")}
                <span>{selectedUpdatesProfile.display_name}</span>
              </button>
            </div>
          ) : null}
        </div>
        <div className="updates-header-trailing">
          {onHideRail ? (
            <button
              type="button"
              className="hub-widget-toggle hub-rail-hide-sidebar-btn"
              onClick={onHideRail}
              aria-label="Hide Updates sidebar"
              title="Hide Updates sidebar"
            >
              <span className="hub-widget-toggle-icon" aria-hidden>
                »
              </span>
            </button>
          ) : null}
          {canCollapse ? (
            <button
              type="button"
              className="hub-widget-toggle hub-daily-card-toggle"
              onClick={onHubDailyExpandedToggle}
              aria-expanded={hubDailyExpanded}
              aria-controls="hub-daily-collapsible"
              title={hubDailyExpanded ? "Minimize daily updates" : "Expand daily updates"}
            >
              <span className="hub-widget-toggle-icon" aria-hidden>
                {hubDailyExpanded ? "−" : "+"}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      <div
        id="hub-daily-collapsible"
        className="hub-daily-card__collapsible"
        {...(canCollapse && !hubDailyExpanded ? { hidden: true } : {})}
      >
        {selectedUpdatesUserId === currentProfile?.id ? (
          <div className={`updates-composer${canCollapse ? "" : " updates-composer--home-pinned"}`.trim()}>
            <textarea
              placeholder="Share an update..."
              value={timelineInput}
              onChange={(event) => onTimelineInputChange(event.target.value)}
              rows={canCollapse ? 3 : 4}
            />
            <button type="button" onClick={() => void onPostUpdate()} disabled={isPostingUpdate || !timelineInput.trim()}>
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
            const explicitState = expandedDatesForUser[dateKey];
            const isExpanded = explicitState ?? groupIndex < 2;
            return (
              <section key={dateKey} data-date-key={dateKey} className="timeline-date-group">
                <button type="button" className="timeline-date-toggle" onClick={() => onToggleDateGroup(dateKey)}>
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
                            <span>{new Date(userUpdateDisplayAtIso(update)).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                            <span>{new Date(userUpdateDisplayAtIso(update)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <div className="timeline-axis" aria-hidden="true">
                            <span className="timeline-dot" />
                            <span className="timeline-line" />
                          </div>
                          <div className="timeline-content">
                            <p className={expanded ? "timeline-body" : "timeline-body timeline-body-clamped"}>{update.body}</p>
                            <div className="timeline-actions">
                              {isLong ? (
                                <button type="button" className="timeline-expand" onClick={() => onToggleExpandedUpdate(update.id)}>
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
                                  onClick={() => void onDeleteUpdate(update.id)}
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
        <p className="chat-error hub-daily-card__error" role="alert">
          {timelineError}
        </p>
      </div>
    </section>
  );
}
