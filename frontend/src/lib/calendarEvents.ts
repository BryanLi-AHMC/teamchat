import { supabase } from "./supabase";

export type CalendarEventRow = {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
  /** Other internal profiles involved (collab / meeting); organizer is always `user_id`. */
  collaborator_user_ids?: string[];
  /** Same id on every mirrored copy of a shared meeting (null for legacy solo rows). */
  event_group_id?: string | null;
};

/** True if the event overlaps the half-open interval [rangeStart, rangeEnd). */
export function calendarEventOverlapsInterval(ev: CalendarEventRow, rangeStart: Date, rangeEnd: Date): boolean {
  const s = new Date(ev.starts_at).getTime();
  const e = new Date(ev.ends_at).getTime();
  return s < rangeEnd.getTime() && e > rangeStart.getTime();
}

/** For each participant, returns existing events that overlap the proposed slot (excluding `ignoreEventId` for edits). */
export async function findBusyConflictsForProposedSlot(
  participantUserIds: string[],
  displayNameById: Record<string, string>,
  proposedStart: Date,
  proposedEnd: Date,
  ignoreEventId?: string
): Promise<{ userId: string; displayName: string; conflicts: CalendarEventRow[] }[]> {
  const rs = proposedStart.toISOString();
  const re = proposedEnd.toISOString();
  const uniqueIds = Array.from(new Set(participantUserIds));
  const out: { userId: string; displayName: string; conflicts: CalendarEventRow[] }[] = [];

  for (const uid of uniqueIds) {
    const rows = await fetchCalendarEventsInRange(uid, rs, re);
    const conflicts = rows.filter(
      (ev) =>
        (!ignoreEventId || ev.id !== ignoreEventId) && calendarEventOverlapsInterval(ev, proposedStart, proposedEnd)
    );
    if (conflicts.length > 0) {
      out.push({
        userId: uid,
        displayName: displayNameById[uid] ?? "Teammate",
        conflicts,
      });
    }
  }
  return out;
}

export async function fetchCalendarEventsInRange(userId: string, rangeStartIso: string, rangeEndIso: string) {
  const { data, error } = await supabase
    .from("timeline_calendar_events")
    .select("id,user_id,title,starts_at,ends_at,created_at,updated_at,collaborator_user_ids,event_group_id")
    .eq("user_id", userId)
    .lt("starts_at", rangeEndIso)
    .gt("ends_at", rangeStartIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => {
    const r = row as CalendarEventRow & { collaborator_user_ids?: unknown };
    return {
      ...r,
      collaborator_user_ids: Array.isArray(r.collaborator_user_ids) ? (r.collaborator_user_ids as string[]) : [],
    };
  }) as CalendarEventRow[];
}

export async function createCalendarEvent(input: {
  userId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  collaboratorUserIds?: string[];
}) {
  const { data: authData } = await supabase.auth.getSession();
  const uid = authData.session?.user?.id;
  if (!uid || uid !== input.userId) {
    throw new Error("You can only create events on your own calendar.");
  }

  const title = input.title.trim() || "(No title)";
  const collaboratorUserIds = input.collaboratorUserIds?.filter(Boolean) ?? [];

  const { data, error } = await supabase.rpc("create_mirror_collab_calendar_events", {
    p_title: title,
    p_starts_at: input.startsAt.toISOString(),
    p_ends_at: input.endsAt.toISOString(),
    p_collaborator_ids: collaboratorUserIds,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object") {
    throw new Error("Invalid response from server.");
  }
  const row = data as CalendarEventRow & { collaborator_user_ids?: unknown };
  return {
    ...row,
    collaborator_user_ids: Array.isArray(row.collaborator_user_ids) ? (row.collaborator_user_ids as string[]) : [],
  };
}

export async function updateCalendarEvent(
  eventId: string,
  input: { title: string; startsAt: Date; endsAt: Date; collaboratorUserIds?: string[] }
) {
  const title = input.title.trim() || "(No title)";
  const patch: Record<string, string | string[]> = {
    title,
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt.toISOString(),
  };
  if (input.collaboratorUserIds !== undefined) {
    patch.collaborator_user_ids = input.collaboratorUserIds.filter(Boolean);
  }
  const { data, error } = await supabase
    .from("timeline_calendar_events")
    .update(patch as never)
    .eq("id", eventId)
    .select("id,user_id,title,starts_at,ends_at,created_at,updated_at,collaborator_user_ids,event_group_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  const row = data as CalendarEventRow;
  return {
    ...row,
    collaborator_user_ids: Array.isArray(row.collaborator_user_ids) ? row.collaborator_user_ids : [],
  };
}

export async function deleteCalendarEvent(eventId: string) {
  const { error } = await supabase.rpc("delete_mirror_calendar_event_group", { p_event_id: eventId });
  if (error) {
    throw new Error(error.message);
  }
}
