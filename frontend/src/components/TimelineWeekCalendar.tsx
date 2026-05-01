import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEventsInRange,
  updateCalendarEvent,
  type CalendarEventRow,
} from "../lib/calendarEvents";
import { getLocalDateKey, getWeekDaysSunday } from "../utils/timelineDates";

const START_HOUR = 6;
const END_HOUR_EXCLUSIVE = 22;
const PX_PER_HOUR = 52;
const TOTAL_HOURS = END_HOUR_EXCLUSIVE - START_HOUR;
const GRID_BODY_HEIGHT = TOTAL_HOURS * PX_PER_HOUR;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function clampEventToDay(event: CalendarEventRow, dayStart: Date, dayEnd: Date): { start: Date; end: Date } | null {
  const evStart = new Date(event.starts_at);
  const evEnd = new Date(event.ends_at);
  const segStart = evStart > dayStart ? evStart : dayStart;
  const segEnd = evEnd < dayEnd ? evEnd : dayEnd;
  if (segStart >= segEnd) {
    return null;
  }
  return { start: segStart, end: segEnd };
}

function segmentStyle(segStart: Date, segEnd: Date, dayStart: Date): { top: number; height: number } {
  const dayGridStart = new Date(dayStart);
  dayGridStart.setHours(START_HOUR, 0, 0, 0);
  const msPerHour = 3600000;
  const topMs = segStart.getTime() - dayGridStart.getTime();
  const durMs = segEnd.getTime() - segStart.getTime();
  let top = (topMs / msPerHour) * PX_PER_HOUR;
  let height = (durMs / msPerHour) * PX_PER_HOUR;
  if (top < 0) {
    height += top;
    top = 0;
  }
  if (top + height > GRID_BODY_HEIGHT) {
    height = Math.max(8, GRID_BODY_HEIGHT - top);
  }
  return { top, height: Math.max(height, 18) };
}

export type TimelineWeekCalendarProps = {
  userId: string;
};

export function TimelineWeekCalendar({ userId }: TimelineWeekCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const weekDays = useMemo(() => getWeekDaysSunday(weekOffset), [weekOffset]);
  const rangeStart = useMemo(() => startOfLocalDay(weekDays[0]!), [weekDays]);
  const rangeEnd = useMemo(() => addDays(startOfLocalDay(weekDays[6]!), 1), [weekDays]);

  const rangeLabel = useMemo(() => {
    const a = weekDays[0]!;
    const b = weekDays[6]!;
    const sameMonth = a.getMonth() === b.getMonth();
    const left = a.toLocaleDateString([], { month: "short", day: "numeric" });
    const right = b.toLocaleDateString(
      [],
      sameMonth ? { day: "numeric", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" }
    );
    return `${left} – ${right}`;
  }, [weekDays]);

  const todayKey = getLocalDateKey(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchCalendarEventsInRange(userId, rangeStart.toISOString(), rangeEnd.toISOString());
      setEvents(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load calendar.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [userId, rangeStart, rangeEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const [modal, setModal] = useState<
    | null
    | {
        mode: "create" | "edit";
        id?: string;
        title: string;
        startsLocal: string;
        endsLocal: string;
      }
  >(null);

  const openCreateAt = (day: Date, hour: number) => {
    setError("");
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setModal({
      mode: "create",
      title: "",
      startsLocal: toDatetimeLocalValue(start),
      endsLocal: toDatetimeLocalValue(end),
    });
  };

  const openEdit = (ev: CalendarEventRow) => {
    setError("");
    setModal({
      mode: "edit",
      id: ev.id,
      title: ev.title,
      startsLocal: toDatetimeLocalValue(new Date(ev.starts_at)),
      endsLocal: toDatetimeLocalValue(new Date(ev.ends_at)),
    });
  };

  const handleSlotClick = (day: Date, clientY: number, rectTop: number) => {
    const y = clientY - rectTop;
    const hourFloat = START_HOUR + y / PX_PER_HOUR;
    const hour = Math.floor(Math.max(START_HOUR, Math.min(END_HOUR_EXCLUSIVE - 1, hourFloat)));
    openCreateAt(day, hour);
  };

  const closeModal = () => {
    setError("");
    setModal(null);
  };

  const handleSaveModal = async () => {
    if (!modal) {
      return;
    }
    const start = new Date(modal.startsLocal);
    const end = new Date(modal.endsLocal);
    if (!(start instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Invalid date or time.");
      return;
    }
    if (end <= start) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (modal.mode === "create") {
        const created = await createCalendarEvent({
          userId,
          title: modal.title,
          startsAt: start,
          endsAt: end,
        });
        setEvents((prev) => [...prev, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      } else if (modal.id) {
        const updated = await updateCalendarEvent(modal.id, {
          title: modal.title,
          startsAt: start,
          endsAt: end,
        });
        setEvents((prev) => prev.map((r) => (r.id === updated.id ? updated : r)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      }
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save event.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteModal = async () => {
    if (!modal?.id) {
      return;
    }
    const ok = window.confirm("Delete this event?");
    if (!ok) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await deleteCalendarEvent(modal.id);
      setEvents((prev) => prev.filter((r) => r.id !== modal.id));
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete.");
    } finally {
      setSaving(false);
    }
  };

  const hourLabels = useMemo(() => {
    const out: number[] = [];
    for (let h = START_HOUR; h < END_HOUR_EXCLUSIVE; h += 1) {
      out.push(h);
    }
    return out;
  }, []);

  return (
    <div className="timeline-week-cal">
      <div className="timeline-week-cal__toolbar">
        <button type="button" className="timeline-week-cal__toolbar-btn timeline-week-cal__toolbar-btn--primary" onClick={() => setWeekOffset(0)}>
          Today
        </button>
        <div className="timeline-week-cal__nav">
          <button type="button" className="timeline-week-cal__icon-btn" aria-label="Previous week" onClick={() => setWeekOffset((o) => o - 1)}>
            ‹
          </button>
          <button type="button" className="timeline-week-cal__icon-btn" aria-label="Next week" onClick={() => setWeekOffset((o) => o + 1)}>
            ›
          </button>
        </div>
        <span className="timeline-week-cal__range">{rangeLabel}</span>
        <button
          type="button"
          className="timeline-week-cal__toolbar-btn timeline-week-cal__toolbar-btn--accent"
          onClick={() => {
            const now = new Date();
            const start = new Date(now);
            start.setMinutes(0, 0, 0);
            if (start < new Date()) {
              start.setHours(start.getHours() + 1);
            }
            const end = new Date(start);
            end.setHours(end.getHours() + 1);
            setModal({
              mode: "create",
              title: "",
              startsLocal: toDatetimeLocalValue(start),
              endsLocal: toDatetimeLocalValue(end),
            });
          }}
        >
          + Add event
        </button>
      </div>

      {error && !modal ? <p className="timeline-week-cal__banner timeline-week-cal__banner--error">{error}</p> : null}
      {loading ? <p className="timeline-week-cal__banner">Loading calendar…</p> : null}

      <div className="timeline-week-cal__scroll">
        <div className="timeline-week-cal__grid" style={{ ["--twc-grid-height" as string]: `${GRID_BODY_HEIGHT}px` }}>
          <div className="timeline-week-cal__corner" aria-hidden />
          {weekDays.map((d) => {
            const key = getLocalDateKey(d);
            const isToday = key === todayKey;
            const dow = d.toLocaleDateString([], { weekday: "short" }).toUpperCase();
            const dom = d.getDate();
            return (
              <div key={key} className={`timeline-week-cal__col-head${isToday ? " timeline-week-cal__col-head--today" : ""}`.trim()}>
                <span className="timeline-week-cal__dow">{dow}</span>
                <span className={`timeline-week-cal__dom${isToday ? " timeline-week-cal__dom--ring" : ""}`.trim()}>{dom}</span>
              </div>
            );
          })}

          <div className="timeline-week-cal__time-col" aria-hidden>
            {hourLabels.map((h) => (
              <div key={h} className="timeline-week-cal__time-label" style={{ height: PX_PER_HOUR }}>
                {new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })}
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const dayStart = startOfLocalDay(day);
            const dayEnd = addDays(dayStart, 1);
            const key = getLocalDateKey(day);

            return (
              <div key={key} className="timeline-week-cal__day-col">
                <div
                  className="timeline-week-cal__day-body"
                  style={{ height: GRID_BODY_HEIGHT }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest(".timeline-week-cal__event")) {
                      return;
                    }
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    handleSlotClick(dayStart, e.clientY, rect.top);
                  }}
                >
                  {hourLabels.map((h) => (
                    <div key={h} className="timeline-week-cal__hour-line" style={{ height: PX_PER_HOUR }} />
                  ))}
                  {events.map((ev) => {
                    const seg = clampEventToDay(ev, dayStart, dayEnd);
                    if (!seg) {
                      return null;
                    }
                    const { top, height } = segmentStyle(seg.start, seg.end, dayStart);
                    return (
                      <button
                        key={`${ev.id}-${key}`}
                        type="button"
                        className="timeline-week-cal__event"
                        style={{ top, height }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(ev);
                        }}
                        title={ev.title}
                      >
                        <span className="timeline-week-cal__event-time">
                          {new Date(ev.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="timeline-week-cal__event-title">{ev.title || "(No title)"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal ? (
        <div className="timeline-week-cal-modal-root" role="dialog" aria-modal="true" aria-labelledby="twc-modal-title">
          <button type="button" className="timeline-week-cal-modal-backdrop" aria-label="Close" onClick={closeModal} />
          <div className="timeline-week-cal-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="twc-modal-title" className="timeline-week-cal-modal__title">
              {modal.mode === "create" ? "New event" : "Edit event"}
            </h2>
            {error ? <p className="timeline-week-cal-modal__error">{error}</p> : null}
            <label className="timeline-week-cal-modal__label">
              Title
              <input
                type="text"
                className="timeline-week-cal-modal__input"
                value={modal.title}
                onChange={(e) => setModal({ ...modal, title: e.target.value })}
                placeholder="Event title"
                autoFocus
              />
            </label>
            <label className="timeline-week-cal-modal__label">
              Starts
              <input
                type="datetime-local"
                className="timeline-week-cal-modal__input"
                value={modal.startsLocal}
                onChange={(e) => setModal({ ...modal, startsLocal: e.target.value })}
              />
            </label>
            <label className="timeline-week-cal-modal__label">
              Ends
              <input
                type="datetime-local"
                className="timeline-week-cal-modal__input"
                value={modal.endsLocal}
                onChange={(e) => setModal({ ...modal, endsLocal: e.target.value })}
              />
            </label>
            <div className="timeline-week-cal-modal__actions">
              {modal.mode === "edit" && modal.id ? (
                <button type="button" className="timeline-week-cal-modal__delete" onClick={() => void handleDeleteModal()} disabled={saving}>
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="timeline-week-cal-modal__actions-right">
                <button type="button" className="timeline-week-cal-modal__cancel" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className="timeline-week-cal-modal__save" onClick={() => void handleSaveModal()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
