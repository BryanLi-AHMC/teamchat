import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchCalendarEventsInRange,
  findBusyConflictsForProposedSlot,
  updateCalendarEvent,
  type CalendarEventRow,
} from "../lib/calendarEvents";
import {
  createMyUpdate,
  deleteMyUpdate,
  fetchUpdatesForUser,
  updateMyUpdate,
  userUpdateDisplayAtIso,
  type UserUpdate,
} from "../lib/updates";
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

const DRAG_CLICK_THRESHOLD_PX = 8;
const DRAG_MIN_DURATION_HOURS = 15 / 60;

function clampDragY(y: number): number {
  return Math.max(0, Math.min(GRID_BODY_HEIGHT, y));
}

function yToHourFloat(y: number): number {
  return START_HOUR + y / PX_PER_HOUR;
}

function clampHourFloat(h: number): number {
  return Math.max(START_HOUR, Math.min(END_HOUR_EXCLUSIVE, h));
}

/** Map a fractional hour on the visible grid (6–22) to an absolute local `Date` on `dayStart`’s calendar day. */
function hourFloatToDateOnDay(dayStart: Date, hourFloat: number): Date {
  const origin = new Date(dayStart);
  origin.setHours(START_HOUR, 0, 0, 0);
  return new Date(origin.getTime() + (hourFloat - START_HOUR) * 3600000);
}

function colorForUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 58% 40%)`;
}

function eventLaneOffset(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 17 + userId.charCodeAt(i)) >>> 0;
  }
  return (h % 5) * 5;
}

/** Visual duration on the grid (not used for scheduling / conflicts). */
const USER_UPDATE_SEGMENT_MS = 25 * 60 * 1000;

function filterUpdatesInRange(updates: UserUpdate[], rangeStart: Date, rangeEnd: Date): UserUpdate[] {
  const a = rangeStart.getTime();
  const b = rangeEnd.getTime();
  return updates.filter((u) => {
    const t = new Date(userUpdateDisplayAtIso(u)).getTime();
    return t >= a && t < b;
  });
}

function userUpdateAsCalendarRow(update: UserUpdate): CalendarEventRow {
  const s = new Date(userUpdateDisplayAtIso(update));
  const e = new Date(s.getTime() + USER_UPDATE_SEGMENT_MS);
  return {
    id: update.id,
    user_id: update.user_id,
    title: "",
    starts_at: s.toISOString(),
    ends_at: e.toISOString(),
    created_at: update.created_at,
    updated_at: update.updated_at,
  };
}

function clampUserUpdateToDay(update: UserUpdate, dayStart: Date, dayEnd: Date) {
  return clampEventToDay(userUpdateAsCalendarRow(update), dayStart, dayEnd);
}

/** Greedy interval layers for overlapping update pills (cascade / staircase layout). */
function assignUpdateOverlapLayers(updates: UserUpdate[]): Map<string, number> {
  const startMs = (u: UserUpdate) => new Date(userUpdateDisplayAtIso(u)).getTime();
  const sorted = [...updates].sort((a, b) => startMs(a) - startMs(b) || a.id.localeCompare(b.id));
  const layerEndMs: number[] = [];
  const idToLayer = new Map<string, number>();
  for (const u of sorted) {
    const s = startMs(u);
    const e = s + USER_UPDATE_SEGMENT_MS;
    let placedLayer = -1;
    for (let i = 0; i < layerEndMs.length; i += 1) {
      if (layerEndMs[i]! <= s) {
        placedLayer = i;
        layerEndMs[i] = e;
        break;
      }
    }
    if (placedLayer === -1) {
      placedLayer = layerEndMs.length;
      layerEndMs.push(e);
    }
    idToLayer.set(u.id, placedLayer);
  }
  return idToLayer;
}

function previewUpdateBody(body: string): string {
  const line = body.trim().split(/\r?\n/)[0] ?? "";
  if (line.length > 72) {
    return `${line.slice(0, 69)}…`;
  }
  return line || "Daily update";
}

export type CollaboratorPickOption = { id: string; display_name: string };

export type TimelineWeekCalendarProps = {
  /** Whose week grid to load (any active teammate once RLS allows team read). */
  calendarUserId: string;
  /** Signed-in user; controls edit vs read-only. */
  viewerUserId: string;
  /** Labels for collaborator chips on events. */
  teammateNameById?: Record<string, string>;
  /** Teammates available when adding collaborators to an event on your own calendar. */
  collaboratorPickOptions?: CollaboratorPickOption[];
  /** Increment from parent after external creates (e.g. rail collab modal) to reload events. */
  reloadToken?: number;
  onCalendarChanged?: () => void;
  /** When viewing someone else’s week, show this line above the grid (read-only). */
  readOnlyBanner?: string;
  /** When 2+ ids, toolbar can show everyone’s events overlapped on one week. */
  teamOverlayUserIds?: string[];
  /** After user_updates create/edit/delete from this calendar, sync parent caches (e.g. Daily Updates rail). */
  onUserUpdatesChanged?: () => void;
};

export function TimelineWeekCalendar({
  calendarUserId,
  viewerUserId,
  teammateNameById = {},
  collaboratorPickOptions = [],
  reloadToken = 0,
  onCalendarChanged,
  readOnlyBanner,
  teamOverlayUserIds,
  onUserUpdatesChanged,
}: TimelineWeekCalendarProps) {
  const canMutate = calendarUserId === viewerUserId;
  const showTeamOverlayToggle = (teamOverlayUserIds?.length ?? 0) > 1;
  const [viewMode, setViewMode] = useState<"single" | "stack">("single");
  const [stackEvents, setStackEvents] = useState<CalendarEventRow[]>([]);
  const [stackLoading, setStackLoading] = useState(false);
  const canCreateInGrid = canMutate && viewMode === "single";
  const skipConflictCheckOnce = useRef(false);
  const [saveConflictBlocks, setSaveConflictBlocks] = useState<
    { userId: string; displayName: string; conflicts: CalendarEventRow[] }[] | null
  >(null);

  const collaboratorSubtitle = (ids: string[] | undefined) => {
    if (!ids?.length) return "";
    const names = ids.map((id) => teammateNameById[id]).filter(Boolean);
    if (names.length === 0) return `${ids.length} teammate${ids.length > 1 ? "s" : ""}`;
    return `w/ ${names.join(", ")}`;
  };
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ colKey: string; y0: number; y1: number } | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    dayStart: Date;
    colKey: string;
    y0: number;
    y1: number;
    bodyEl: HTMLDivElement;
  } | null>(null);
  const dragListenersCleanupRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    return () => {
      dragListenersCleanupRef.current?.();
      dragListenersCleanupRef.current = null;
      const s = dragSessionRef.current;
      if (s) {
        try {
          s.bodyEl.releasePointerCapture(s.pointerId);
        } catch {
          /* ignore */
        }
      }
      dragSessionRef.current = null;
      setDragPreview(null);
    };
  }, [weekOffset, calendarUserId, viewMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchCalendarEventsInRange(calendarUserId, rangeStart.toISOString(), rangeEnd.toISOString());
      setEvents(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load calendar.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [calendarUserId, rangeStart, rangeEnd]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const stackIdsKey = (teamOverlayUserIds ?? []).join(",");

  useEffect(() => {
    if (!showTeamOverlayToggle && viewMode === "stack") {
      setViewMode("single");
    }
  }, [showTeamOverlayToggle, viewMode]);

  useEffect(() => {
    if (viewMode !== "stack" || !teamOverlayUserIds?.length) {
      setStackEvents([]);
      setStackLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setStackLoading(true);
      try {
        const merged: CalendarEventRow[] = [];
        for (const uid of teamOverlayUserIds) {
          const rows = await fetchCalendarEventsInRange(uid, rangeStart.toISOString(), rangeEnd.toISOString());
          if (cancelled) {
            return;
          }
          merged.push(...rows);
        }
        if (!cancelled) {
          merged.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          setStackEvents(merged);
        }
      } catch {
        if (!cancelled) {
          setStackEvents([]);
        }
      } finally {
        if (!cancelled) {
          setStackLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, stackIdsKey, rangeStart, rangeEnd, reloadToken, teamOverlayUserIds]);

  const [weekUserUpdates, setWeekUserUpdates] = useState<UserUpdate[]>([]);

  const loadWeekUserUpdates = useCallback(async () => {
    try {
      if (viewMode === "stack" && teamOverlayUserIds?.length) {
        const merged: UserUpdate[] = [];
        for (const uid of teamOverlayUserIds) {
          const rows = await fetchUpdatesForUser(uid);
          merged.push(...filterUpdatesInRange(rows, rangeStart, rangeEnd));
        }
        merged.sort(
          (a, b) => new Date(userUpdateDisplayAtIso(a)).getTime() - new Date(userUpdateDisplayAtIso(b)).getTime()
        );
        setWeekUserUpdates(merged);
      } else {
        const rows = await fetchUpdatesForUser(calendarUserId);
        setWeekUserUpdates(filterUpdatesInRange(rows, rangeStart, rangeEnd));
      }
    } catch {
      setWeekUserUpdates([]);
    }
  }, [calendarUserId, rangeStart, rangeEnd, viewMode, stackIdsKey, teamOverlayUserIds, reloadToken]);

  useEffect(() => {
    void loadWeekUserUpdates();
  }, [loadWeekUserUpdates]);

  const [modal, setModal] = useState<
    | null
    | {
        mode: "create" | "edit";
        id?: string;
        title: string;
        startsLocal: string;
        endsLocal: string;
        collaboratorIds: string[];
      }
  >(null);

  const [updateSheet, setUpdateSheet] = useState<null | { mode: "create" } | { mode: "edit"; update: UserUpdate }>(null);
  const [updateBody, setUpdateBody] = useState("");
  const [updateDisplayLocal, setUpdateDisplayLocal] = useState("");
  const [updateErr, setUpdateErr] = useState("");
  const [updateSaving, setUpdateSaving] = useState(false);

  const closeUpdateSheet = () => {
    setUpdateSheet(null);
    setUpdateErr("");
    setUpdateBody("");
    setUpdateDisplayLocal("");
    setUpdateSaving(false);
  };

  const openUpdateCreate = () => {
    if (!canMutate || !canCreateInGrid) {
      return;
    }
    setModal(null);
    setError("");
    setSaveConflictBlocks(null);
    setUpdateErr("");
    setUpdateBody("");
    setUpdateDisplayLocal(toDatetimeLocalValue(new Date()));
    setUpdateSheet({ mode: "create" });
  };

  const openUpdateEdit = (u: UserUpdate) => {
    const canEdit = u.user_id === viewerUserId && (canMutate || viewMode === "stack");
    if (!canEdit) {
      return;
    }
    setModal(null);
    setError("");
    setSaveConflictBlocks(null);
    setUpdateErr("");
    setUpdateBody(u.body);
    setUpdateDisplayLocal(toDatetimeLocalValue(new Date(userUpdateDisplayAtIso(u))));
    setUpdateSheet({ mode: "edit", update: u });
  };

  const handleSaveUpdateSheet = async () => {
    if (!updateSheet) {
      return;
    }
    const text = updateBody.trim();
    if (!text) {
      setUpdateErr("Write something first.");
      return;
    }
    const at = new Date(updateDisplayLocal);
    if (Number.isNaN(at.getTime())) {
      setUpdateErr("Invalid date or time.");
      return;
    }
    const displayAtIso = at.toISOString();
    setUpdateSaving(true);
    setUpdateErr("");
    try {
      if (updateSheet.mode === "create") {
        await createMyUpdate(text, displayAtIso);
      } else {
        await updateMyUpdate(updateSheet.update.id, { body: text, display_at: displayAtIso });
      }
      closeUpdateSheet();
      await loadWeekUserUpdates();
      onUserUpdatesChanged?.();
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : "Unable to save update.");
    } finally {
      setUpdateSaving(false);
    }
  };

  const handleDeleteUpdateSheet = async () => {
    if (!updateSheet || updateSheet.mode !== "edit") {
      return;
    }
    const ok = window.confirm("Delete this daily update?");
    if (!ok) {
      return;
    }
    setUpdateSaving(true);
    setUpdateErr("");
    try {
      await deleteMyUpdate(updateSheet.update.id);
      closeUpdateSheet();
      await loadWeekUserUpdates();
      onUserUpdatesChanged?.();
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : "Unable to delete.");
    } finally {
      setUpdateSaving(false);
    }
  };

  const openCreateAt = (day: Date, hour: number) => {
    if (!canCreateInGrid) {
      return;
    }
    closeUpdateSheet();
    setError("");
    setSaveConflictBlocks(null);
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setModal({
      mode: "create",
      title: "",
      startsLocal: toDatetimeLocalValue(start),
      endsLocal: toDatetimeLocalValue(end),
      collaboratorIds: [],
    });
  };

  const openCreateFromDragRange = (dayStart: Date, hourStartFloat: number, hourEndFloat: number) => {
    if (!canCreateInGrid) {
      return;
    }
    closeUpdateSheet();
    setError("");
    setSaveConflictBlocks(null);
    let h0 = Math.min(hourStartFloat, hourEndFloat);
    let h1 = Math.max(hourStartFloat, hourEndFloat);
    h0 = clampHourFloat(h0);
    h1 = clampHourFloat(h1);
    if (h1 - h0 < DRAG_MIN_DURATION_HOURS) {
      h1 = Math.min(END_HOUR_EXCLUSIVE, h0 + DRAG_MIN_DURATION_HOURS);
    }
    const start = hourFloatToDateOnDay(dayStart, h0);
    let end = hourFloatToDateOnDay(dayStart, h1);
    if (end <= start) {
      end = new Date(start.getTime() + DRAG_MIN_DURATION_HOURS * 3600000);
    }
    setModal({
      mode: "create",
      title: "",
      startsLocal: toDatetimeLocalValue(start),
      endsLocal: toDatetimeLocalValue(end),
      collaboratorIds: [],
    });
  };

  const canOpenEdit = (ev: CalendarEventRow) => ev.user_id === viewerUserId && (canMutate || viewMode === "stack");

  const openEdit = (ev: CalendarEventRow) => {
    if (!canOpenEdit(ev)) {
      return;
    }
    closeUpdateSheet();
    setError("");
    setSaveConflictBlocks(null);
    setModal({
      mode: "edit",
      id: ev.id,
      title: ev.title,
      startsLocal: toDatetimeLocalValue(new Date(ev.starts_at)),
      endsLocal: toDatetimeLocalValue(new Date(ev.ends_at)),
      collaboratorIds: [...(ev.collaborator_user_ids ?? [])],
    });
  };

  const beginGridDragCreate = (dayStart: Date, colKey: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (!canCreateInGrid || e.button !== 0) {
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest(".timeline-week-cal__event") || t.closest(".timeline-week-cal__day-update")) {
      return;
    }
    const bodyEl = e.currentTarget;
    const rect = bodyEl.getBoundingClientRect();
    const y0 = clampDragY(e.clientY - rect.top);
    const pointerId = e.pointerId;
    dragSessionRef.current = { pointerId, dayStart, colKey, y0, y1: y0, bodyEl };
    setDragPreview({ colKey, y0, y1: y0 });
    try {
      bodyEl.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }

    const move = (pe: PointerEvent) => {
      const s = dragSessionRef.current;
      if (!s || pe.pointerId !== s.pointerId) {
        return;
      }
      const r = s.bodyEl.getBoundingClientRect();
      const y1 = clampDragY(pe.clientY - r.top);
      s.y1 = y1;
      setDragPreview({ colKey: s.colKey, y0: s.y0, y1 });
    };

    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dragListenersCleanupRef.current = null;
    };

    const finish = (pe: PointerEvent) => {
      const s = dragSessionRef.current;
      if (!s || pe.pointerId !== s.pointerId) {
        return;
      }
      detach();
      try {
        s.bodyEl.releasePointerCapture(pe.pointerId);
      } catch {
        /* ignore */
      }
      const r = s.bodyEl.getBoundingClientRect();
      const yRelease = clampDragY(pe.clientY - r.top);
      const y0 = s.y0;
      const dayStart = s.dayStart;
      dragSessionRef.current = null;
      setDragPreview(null);

      if (Math.abs(yRelease - y0) < DRAG_CLICK_THRESHOLD_PX) {
        const hourFloat = yToHourFloat((y0 + yRelease) / 2);
        const hour = Math.floor(Math.max(START_HOUR, Math.min(END_HOUR_EXCLUSIVE - 1, hourFloat)));
        openCreateAt(dayStart, hour);
        return;
      }
      const h0 = yToHourFloat(Math.min(y0, yRelease));
      const h1 = yToHourFloat(Math.max(y0, yRelease));
      openCreateFromDragRange(dayStart, h0, h1);
    };

    dragListenersCleanupRef.current = detach;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const closeModal = () => {
    setError("");
    setSaveConflictBlocks(null);
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
    if (!skipConflictCheckOnce.current) {
      const participantIds = [viewerUserId, ...modal.collaboratorIds];
      const ignoreId = modal.mode === "edit" ? modal.id : undefined;
      const conflicts = await findBusyConflictsForProposedSlot(
        participantIds,
        teammateNameById,
        start,
        end,
        ignoreId
      );
      if (conflicts.length > 0) {
        setSaveConflictBlocks(conflicts);
        return;
      }
    } else {
      skipConflictCheckOnce.current = false;
    }
    setSaving(true);
    setError("");
    setSaveConflictBlocks(null);
    try {
      if (modal.mode === "create") {
        const created = await createCalendarEvent({
          userId: viewerUserId,
          title: modal.title,
          startsAt: start,
          endsAt: end,
          collaboratorUserIds: modal.collaboratorIds,
        });
        setEvents((prev) => [...prev, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      } else if (modal.id) {
        const updated = await updateCalendarEvent(modal.id, {
          title: modal.title,
          startsAt: start,
          endsAt: end,
          collaboratorUserIds: modal.collaboratorIds,
        });
        setEvents((prev) => prev.map((r) => (r.id === updated.id ? updated : r)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      }
      closeModal();
      onCalendarChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save event.");
      setSaveConflictBlocks(null);
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
      onCalendarChanged?.();
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

  const displayEvents = viewMode === "stack" ? stackEvents : events;
  const gridLoading = loading || (viewMode === "stack" && stackLoading);

  const updatesByDayKey = useMemo(() => {
    const m = new Map<string, UserUpdate[]>();
    for (const d of weekDays) {
      const dayStart = startOfLocalDay(d);
      const dayEnd = addDays(dayStart, 1);
      const key = getLocalDateKey(d);
      const list: UserUpdate[] = [];
      for (const u of weekUserUpdates) {
        if (clampUserUpdateToDay(u, dayStart, dayEnd)) {
          list.push(u);
        }
      }
      m.set(key, list);
    }
    return m;
  }, [weekDays, weekUserUpdates]);

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
        {showTeamOverlayToggle ? (
          <div className="timeline-week-cal__view-toggle" role="group" aria-label="Week view mode">
            <button
              type="button"
              className={`timeline-week-cal__view-toggle-btn${viewMode === "single" ? " timeline-week-cal__view-toggle-btn--active" : ""}`}
              onClick={() => setViewMode("single")}
            >
              One person
            </button>
            <button
              type="button"
              className={`timeline-week-cal__view-toggle-btn${viewMode === "stack" ? " timeline-week-cal__view-toggle-btn--active" : ""}`}
              onClick={() => setViewMode("stack")}
            >
              Team overlap
            </button>
          </div>
        ) : null}
        {canMutate && canCreateInGrid ? (
          <div className="timeline-week-cal__toolbar-actions">
            <button
              type="button"
              className="timeline-week-cal__toolbar-btn timeline-week-cal__toolbar-btn--accent"
              onClick={() => {
                closeUpdateSheet();
                setSaveConflictBlocks(null);
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
                  collaboratorIds: [],
                });
              }}
            >
              + Add event
            </button>
            <button type="button" className="timeline-week-cal__toolbar-btn timeline-week-cal__toolbar-btn--update" onClick={openUpdateCreate}>
              Add update
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === "stack" && showTeamOverlayToggle ? (
        <div className="timeline-week-cal__legend" aria-hidden={false}>
          {(teamOverlayUserIds ?? []).map((uid) => (
            <span key={uid} className="timeline-week-cal__legend-chip">
              <span className="timeline-week-cal__legend-swatch" style={{ background: colorForUserId(uid) }} />
              {uid === viewerUserId ? "You" : teammateNameById[uid] ?? "Teammate"}
            </span>
          ))}
          <span className="timeline-week-cal__legend-chip">
            <span className="timeline-week-cal__legend-swatch timeline-week-cal__legend-swatch--update" />
            Daily update
          </span>
        </div>
      ) : null}

      {readOnlyBanner ? <p className="timeline-week-cal__banner timeline-week-cal__banner--muted">{readOnlyBanner}</p> : null}
      {viewMode === "stack" && canMutate ? (
        <p className="timeline-week-cal__banner timeline-week-cal__banner--muted">
          Team overlap shows everyone on one week. Switch to &quot;One person&quot; to add events or click / drag empty slots.
        </p>
      ) : null}
      {error && !modal ? <p className="timeline-week-cal__banner timeline-week-cal__banner--error">{error}</p> : null}
      {gridLoading ? <p className="timeline-week-cal__banner">Loading calendar…</p> : null}

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
            const dayUpdates = updatesByDayKey.get(key) ?? [];
            const updateLayers = assignUpdateOverlapLayers(dayUpdates);

            return (
              <div key={key} className="timeline-week-cal__day-col">
                <div
                  className={`timeline-week-cal__day-body${canCreateInGrid ? "" : " timeline-week-cal__day-body--readonly"}${
                    dragPreview?.colKey === key ? " timeline-week-cal__day-body--dragging" : ""
                  }`.trim()}
                  style={{ height: GRID_BODY_HEIGHT }}
                  onPointerDown={canCreateInGrid ? (e) => beginGridDragCreate(dayStart, key, e) : undefined}
                >
                  {hourLabels.map((h) => (
                    <div key={h} className="timeline-week-cal__hour-line" style={{ height: PX_PER_HOUR }} />
                  ))}
                  {dragPreview && dragPreview.colKey === key ? (
                    <div
                      className="timeline-week-cal__drag-sel"
                      aria-hidden
                      style={{
                        top: Math.min(dragPreview.y0, dragPreview.y1),
                        height: Math.max(4, Math.abs(dragPreview.y1 - dragPreview.y0)),
                      }}
                    />
                  ) : null}
                  {displayEvents.map((ev) => {
                    const seg = clampEventToDay(ev, dayStart, dayEnd);
                    if (!seg) {
                      return null;
                    }
                    const { top, height } = segmentStyle(seg.start, seg.end, dayStart);
                    const sub = collaboratorSubtitle(ev.collaborator_user_ids);
                    const ownerShort =
                      viewMode === "stack"
                        ? ev.user_id === viewerUserId
                          ? "You"
                          : teammateNameById[ev.user_id] ?? "Teammate"
                        : null;
                    const stackStyle: CSSProperties =
                      viewMode === "stack"
                        ? {
                            top,
                            height,
                            left: 3 + eventLaneOffset(ev.user_id),
                            right: 8,
                            width: "auto",
                            borderLeftWidth: 3,
                            borderLeftStyle: "solid",
                            borderLeftColor: colorForUserId(ev.user_id),
                          }
                        : { top, height };
                    const inner = (
                      <>
                        <span className="timeline-week-cal__event-time">
                          {new Date(ev.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="timeline-week-cal__event-title">
                          {ownerShort ? (
                            <span className="timeline-week-cal__event-owner">{ownerShort}: </span>
                          ) : null}
                          {ev.title || "(No title)"}
                        </span>
                        {sub ? <span className="timeline-week-cal__event-collabs">{sub}</span> : null}
                      </>
                    );
                    const interactive = canOpenEdit(ev);
                    return interactive ? (
                      <button
                        key={`${ev.id}-${key}`}
                        type="button"
                        className={`timeline-week-cal__event${viewMode === "stack" ? " timeline-week-cal__event--stack" : ""}`.trim()}
                        style={stackStyle}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(ev);
                        }}
                        title={ev.title}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div
                        key={`${ev.id}-${key}`}
                        className={`timeline-week-cal__event timeline-week-cal__event--readonly${viewMode === "stack" ? " timeline-week-cal__event--stack" : ""}`.trim()}
                        style={stackStyle}
                        title={ev.title}
                      >
                        {inner}
                      </div>
                    );
                  })}
                  {dayUpdates.map((u) => {
                    const seg = clampUserUpdateToDay(u, dayStart, dayEnd);
                    if (!seg) {
                      return null;
                    }
                    const { top, height } = segmentStyle(seg.start, seg.end, dayStart);
                    const layer = updateLayers.get(u.id) ?? 0;
                    const cascadeX = layer * 12;
                    const cascadeY = layer * 10;
                    const ownerShort =
                      viewMode === "stack"
                        ? u.user_id === viewerUserId
                          ? "You"
                          : teammateNameById[u.user_id] ?? "Teammate"
                        : null;
                    const baseLeft = viewMode === "stack" ? 3 + eventLaneOffset(u.user_id) : 3;
                    const stackStyle: CSSProperties =
                      viewMode === "stack"
                        ? {
                            top: top + cascadeY,
                            height,
                            left: baseLeft + cascadeX,
                            right: Math.max(4, 8 - cascadeX * 0.25),
                            width: "auto",
                            borderLeftWidth: 3,
                            borderLeftStyle: "solid",
                            borderLeftColor: "#0f766e",
                            zIndex: 5 + layer,
                            boxShadow: layer > 0 ? "0 2px 6px rgba(0,0,0,0.14)" : undefined,
                          }
                        : {
                            top: top + cascadeY,
                            height,
                            left: baseLeft + cascadeX,
                            right: Math.max(3, 3 - cascadeX * 0.15),
                            zIndex: 5 + layer,
                            boxShadow: layer > 0 ? "0 2px 6px rgba(0,0,0,0.14)" : undefined,
                          };
                    const label = previewUpdateBody(u.body);
                    const interactive = u.user_id === viewerUserId && (canMutate || viewMode === "stack");
                    const layerClass = layer > 0 ? " timeline-week-cal__day-update--cascade" : "";
                    const inner = (
                      <>
                        <span className="timeline-week-cal__day-update-time">
                          {new Date(userUpdateDisplayAtIso(u)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="timeline-week-cal__day-update-body">
                          {ownerShort ? <span className="timeline-week-cal__day-update-owner">{ownerShort}: </span> : null}
                          {label}
                        </span>
                      </>
                    );
                    return interactive ? (
                      <button
                        key={`upd-${u.id}-${key}`}
                        type="button"
                        className={`timeline-week-cal__day-update${viewMode === "stack" ? " timeline-week-cal__day-update--stack" : ""}${layerClass}`.trim()}
                        style={stackStyle}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openUpdateEdit(u);
                        }}
                        title={u.body}
                      >
                        {inner}
                      </button>
                    ) : (
                      <div
                        key={`upd-${u.id}-${key}`}
                        className={`timeline-week-cal__day-update timeline-week-cal__day-update--readonly${
                          viewMode === "stack" ? " timeline-week-cal__day-update--stack" : ""
                        }${layerClass}`.trim()}
                        style={stackStyle}
                        title={u.body}
                      >
                        {inner}
                      </div>
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
            {saveConflictBlocks?.length ? (
              <div className="timeline-week-cal-modal__warn" role="status">
                <strong>Scheduling conflict</strong>
                <ul className="timeline-week-cal-modal__warn-list">
                  {saveConflictBlocks.flatMap((b) =>
                    b.conflicts.map((ev) => {
                      const until = new Date(ev.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                      const title = ev.title?.trim() || "(No title)";
                      return (
                        <li key={`${b.userId}-${ev.id}`}>
                          {b.displayName} is busy until {until} (“{title}”).
                        </li>
                      );
                    })
                  )}
                </ul>
                <div className="timeline-week-cal-modal__warn-actions">
                  <button type="button" className="timeline-week-cal-modal__cancel" onClick={() => setSaveConflictBlocks(null)} disabled={saving}>
                    Choose another time
                  </button>
                  <button
                    type="button"
                    className="timeline-week-cal-modal__save"
                    disabled={saving}
                    onClick={() => {
                      skipConflictCheckOnce.current = true;
                      void handleSaveModal();
                    }}
                  >
                    Schedule anyway
                  </button>
                </div>
              </div>
            ) : null}
            <label className="timeline-week-cal-modal__label">
              Title
              <input
                type="text"
                className="timeline-week-cal-modal__input"
                value={modal.title}
                onChange={(e) => {
                  setSaveConflictBlocks(null);
                  setModal({ ...modal, title: e.target.value });
                }}
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
                onChange={(e) => {
                  setSaveConflictBlocks(null);
                  setModal({ ...modal, startsLocal: e.target.value });
                }}
              />
            </label>
            <label className="timeline-week-cal-modal__label">
              Ends
              <input
                type="datetime-local"
                className="timeline-week-cal-modal__input"
                value={modal.endsLocal}
                onChange={(e) => {
                  setSaveConflictBlocks(null);
                  setModal({ ...modal, endsLocal: e.target.value });
                }}
              />
            </label>
            {canMutate && collaboratorPickOptions.length > 0 ? (
              <fieldset className="timeline-week-cal-modal__fieldset">
                <legend className="timeline-week-cal-modal__legend">Collaborators</legend>
                <p className="timeline-week-cal-modal__fieldset-hint">Each person selected also gets this event on their calendar.</p>
                <div className="timeline-week-cal-modal__checks">
                  {collaboratorPickOptions.map((p) => (
                    <label key={p.id} className="timeline-week-cal-modal__check">
                      <input
                        type="checkbox"
                        checked={modal.collaboratorIds.includes(p.id)}
                        onChange={() => {
                          setSaveConflictBlocks(null);
                          setModal((m) => {
                            if (!m) return m;
                            const next = new Set(m.collaboratorIds);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return { ...m, collaboratorIds: [...next] };
                          });
                        }}
                      />
                      <span>{p.display_name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
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

      {updateSheet ? (
        <div className="timeline-week-cal-modal-root" role="dialog" aria-modal="true" aria-labelledby="twc-update-modal-title">
          <button type="button" className="timeline-week-cal-modal-backdrop" aria-label="Close" onClick={closeUpdateSheet} />
          <div className="timeline-week-cal-modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="twc-update-modal-title" className="timeline-week-cal-modal__title">
              {updateSheet.mode === "create" ? "New daily update" : "Edit daily update"}
            </h2>
            {updateErr ? <p className="timeline-week-cal-modal__error">{updateErr}</p> : null}
            <p className="timeline-week-cal-modal__fieldset-hint">
              Shown on your calendar in teal (overlapping updates stagger like cards). Does not block scheduling.
            </p>
            <label className="timeline-week-cal-modal__label">
              Time on calendar
              <input
                type="datetime-local"
                className="timeline-week-cal-modal__input"
                value={updateDisplayLocal}
                onChange={(e) => {
                  setUpdateErr("");
                  setUpdateDisplayLocal(e.target.value);
                }}
              />
            </label>
            <label className="timeline-week-cal-modal__label">
              Update
              <textarea
                className="timeline-week-cal-modal__textarea"
                rows={5}
                value={updateBody}
                onChange={(e) => {
                  setUpdateErr("");
                  setUpdateBody(e.target.value);
                }}
                placeholder="What did you work on today?"
                autoFocus
              />
            </label>
            <div className="timeline-week-cal-modal__actions">
              {updateSheet.mode === "edit" ? (
                <button type="button" className="timeline-week-cal-modal__delete" onClick={() => void handleDeleteUpdateSheet()} disabled={updateSaving}>
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="timeline-week-cal-modal__actions-right">
                <button type="button" className="timeline-week-cal-modal__cancel" onClick={closeUpdateSheet} disabled={updateSaving}>
                  Cancel
                </button>
                <button type="button" className="timeline-week-cal-modal__save" onClick={() => void handleSaveUpdateSheet()} disabled={updateSaving}>
                  {updateSaving ? "Saving…" : updateSheet.mode === "create" ? "Post" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
