import { supabase } from "./supabase";

export type CalendarEventRow = {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
};

export async function fetchCalendarEventsInRange(userId: string, rangeStartIso: string, rangeEndIso: string) {
  const { data, error } = await supabase
    .from("timeline_calendar_events")
    .select("id,user_id,title,starts_at,ends_at,created_at,updated_at")
    .eq("user_id", userId)
    .lt("starts_at", rangeEndIso)
    .gt("ends_at", rangeStartIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as CalendarEventRow[];
}

export async function createCalendarEvent(input: {
  userId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const title = input.title.trim() || "(No title)";
  const { data, error } = await supabase
    .from("timeline_calendar_events")
    .insert({
      user_id: input.userId,
      title,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
    })
    .select("id,user_id,title,starts_at,ends_at,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as CalendarEventRow;
}

export async function updateCalendarEvent(
  eventId: string,
  input: { title: string; startsAt: Date; endsAt: Date }
) {
  const title = input.title.trim() || "(No title)";
  const { data, error } = await supabase
    .from("timeline_calendar_events")
    .update({
      title,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
    })
    .eq("id", eventId)
    .select("id,user_id,title,starts_at,ends_at,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as CalendarEventRow;
}

export async function deleteCalendarEvent(eventId: string) {
  const { error } = await supabase.from("timeline_calendar_events").delete().eq("id", eventId);
  if (error) {
    throw new Error(error.message);
  }
}
