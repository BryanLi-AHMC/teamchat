-- Team members can view active teammates' week calendars (same internal org).
-- Optional collaborator ids on events for collabs / meetings (metadata; invites still on organizer's row).

alter table public.timeline_calendar_events
  add column if not exists collaborator_user_ids uuid[] not null default '{}'::uuid[];

drop policy if exists "timeline_calendar_events_select_own" on public.timeline_calendar_events;

create policy "timeline_calendar_events_select_active_team"
on public.timeline_calendar_events
for select
to authenticated
using (
  exists (
    select 1
    from public.internal_profiles ip
    where ip.id = timeline_calendar_events.user_id
      and coalesce(ip.is_active, true)
  )
);
