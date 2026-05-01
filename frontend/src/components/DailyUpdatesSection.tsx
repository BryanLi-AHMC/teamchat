import type { RefObject, ReactNode } from "react";
import type { InternalProfile } from "../lib/authProfile";
import type { UserUpdate } from "../lib/updates";
import { formatTimelineDateLabel, getLocalDateKey, getWeekDaysSunday } from "../utils/timelineDates";

export type DailyUpdatesSectionProps = {
  variant: "hub" | "timeline";
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
  calendarWeekOffset: number;
  onCalendarWeekOffsetDelta: (delta: -1 | 1) => void;
  updatesDateKeySet: Set<string>;
  onJumpToDate: (dateKey: string) => void;
  onViewUpdatesProfile: (userId: string) => void;
  renderPresencePetAvatar: (
    profile: InternalProfile | undefined,
    size: "xs" | "sm" | "md" | "lg" | "xl",
    extraClass?: string
  ) => ReactNode;
};

export function DailyUpdatesSection({
  variant,
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
  calendarWeekOffset,
  onCalendarWeekOffsetDelta,
  updatesDateKeySet,
  onJumpToDate,
  onViewUpdatesProfile,
  renderPresencePetAvatar,
}: DailyUpdatesSectionProps) {
  const isTimeline = variant === "timeline";
  const weekDays = getWeekDaysSunday(calendarWeekOffset);
  const todayKey = getLocalDateKey(new Date());
  const tzLabel =
    typeof Intl !== "undefined"
      ? new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value
      : null;

  const weekStrip = (
    <div
      className={`updates-week-strip${isTimeline ? " updates-week-strip--timeline" : " updates-week-strip--hub"}`.trim()}
    >
      <div className="updates-week-strip__toolbar">
        <button
          type="button"
          className="updates-week-strip__nav"
          aria-label="Previous week"
          onClick={() => onCalendarWeekOffsetDelta(-1)}
        >
          ‹
        </button>
        <span className="updates-week-strip__tz">{tzLabel ?? ""}</span>
        <button
          type="button"
          className="updates-week-strip__nav"
          aria-label="Next week"
          onClick={() => onCalendarWeekOffsetDelta(1)}
        >
          ›
        </button>
      </div>
      <div className="updates-week-strip__row" role="list">
        {weekDays.map((d) => {
          const key = getLocalDateKey(d);
          const isToday = key === todayKey;
          const hasUpdates = updatesDateKeySet.has(key);
          const dow = d.toLocaleDateString([], { weekday: "short" }).toUpperCase();
          const dayNum = d.getDate();
          return (
            <button
              key={key}
              type="button"
              role="listitem"
              className={`updates-week-day${isToday ? " updates-week-day--today" : ""}${hasUpdates ? " updates-week-day--has-updates" : ""}`.trim()}
              onClick={() => onJumpToDate(key)}
              title={formatTimelineDateLabel(key)}
            >
              <span className="updates-week-day__dow">{dow}</span>
              <span className="updates-week-day__num">{dayNum}</span>
              {hasUpdates ? <span className="updates-week-day__dot" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const sectionClass =
    `hub-daily-card${hubDailyExpanded ? "" : " hub-daily-card--collapsed"}${isTimeline ? " hub-daily-card--timeline-sidebar" : ""}`.trim();

  return (
    <section className={sectionClass} aria-labelledby="hub-daily-title">
      {isTimeline ? weekStrip : null}

      <header className="updates-header hub-daily-card__header">
        <div className="updates-header-profile-block">
          <span className="hub-daily-eyebrow">Today</span>
          <h3 id="hub-daily-title">Daily Updates</h3>
          {selectedUpdatesProfile ? (
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
        </div>
      </header>

      {!isTimeline ? weekStrip : null}

      <div id="hub-daily-collapsible" className="hub-daily-card__collapsible" hidden={!hubDailyExpanded}>
        {selectedUpdatesUserId === currentProfile?.id ? (
          <div className="updates-composer">
            <textarea
              placeholder="Share an update..."
              value={timelineInput}
              onChange={(event) => onTimelineInputChange(event.target.value)}
              rows={3}
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
