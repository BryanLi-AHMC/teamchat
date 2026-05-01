-- Personal week-calendar events for the Timeline dashboard (Google Calendar–style week view).

create table if not exists public.timeline_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timeline_calendar_events_end_after_start check (ends_at > starts_at)
);

create index if not exists idx_timeline_calendar_events_user_starts
  on public.timeline_calendar_events (user_id, starts_at);

create or replace function public.set_timeline_calendar_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_timeline_calendar_events_updated_at on public.timeline_calendar_events;

create trigger set_timeline_calendar_events_updated_at
before update on public.timeline_calendar_events
for each row
execute function public.set_timeline_calendar_events_updated_at();

alter table public.timeline_calendar_events enable row level security;

drop policy if exists "timeline_calendar_events_select_own" on public.timeline_calendar_events;
drop policy if exists "timeline_calendar_events_insert_own" on public.timeline_calendar_events;
drop policy if exists "timeline_calendar_events_update_own" on public.timeline_calendar_events;
drop policy if exists "timeline_calendar_events_delete_own" on public.timeline_calendar_events;

create policy "timeline_calendar_events_select_own"
on public.timeline_calendar_events
for select
to authenticated
using (user_id = auth.uid());

create policy "timeline_calendar_events_insert_own"
on public.timeline_calendar_events
for insert
to authenticated
with check (user_id = auth.uid());

create policy "timeline_calendar_events_update_own"
on public.timeline_calendar_events
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "timeline_calendar_events_delete_own"
on public.timeline_calendar_events
for delete
to authenticated
using (user_id = auth.uid());
