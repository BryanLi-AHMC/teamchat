-- Link mirrored rows with event_group_id; deleting any copy removes all copies in the group.

alter table public.timeline_calendar_events
  add column if not exists event_group_id uuid;

create index if not exists idx_timeline_calendar_events_event_group
  on public.timeline_calendar_events (event_group_id)
  where event_group_id is not null;

create or replace function public.create_mirror_collab_calendar_events(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_collaborator_ids uuid[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  organizer uuid := auth.uid();
  all_ids uuid[];
  pid uuid;
  other_ids uuid[];
  inserted_row public.timeline_calendar_events%rowtype;
  org_row public.timeline_calendar_events%rowtype;
  t text;
  eg uuid := gen_random_uuid();
begin
  if organizer is null then
    raise exception 'Not authenticated';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  t := trim(coalesce(p_title, ''));
  if t = '' then
    t := '(No title)';
  end if;

  all_ids := array(
    select distinct unnest(coalesce(p_collaborator_ids, array[]::uuid[]) || array[organizer]::uuid[])
  );

  foreach pid in array all_ids loop
    if not exists (
      select 1
      from public.internal_profiles ip
      where ip.id = pid
        and coalesce(ip.is_active, true)
    ) then
      raise exception 'Invalid or inactive participant';
    end if;
  end loop;

  foreach pid in array all_ids loop
    other_ids := array_remove(all_ids, pid);
    insert into public.timeline_calendar_events (
      user_id,
      title,
      starts_at,
      ends_at,
      collaborator_user_ids,
      event_group_id
    )
    values (pid, t, p_starts_at, p_ends_at, coalesce(other_ids, array[]::uuid[]), eg)
    returning * into inserted_row;

    if pid = organizer then
      org_row := inserted_row;
    end if;
  end loop;

  return row_to_json(org_row);
end;
$$;

create or replace function public.delete_mirror_calendar_event_group(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  grp uuid;
  owner_user uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select e.user_id, e.event_group_id
  into owner_user, grp
  from public.timeline_calendar_events e
  where e.id = p_event_id;

  if owner_user is null then
    raise exception 'Event not found';
  end if;

  if owner_user <> uid then
    raise exception 'You can only delete events from your own calendar';
  end if;

  if grp is null then
    delete from public.timeline_calendar_events
    where id = p_event_id
      and user_id = uid;
  else
    delete from public.timeline_calendar_events
    where event_group_id = grp;
  end if;
end;
$$;

revoke all on function public.create_mirror_collab_calendar_events(text, timestamptz, timestamptz, uuid[]) from public;
grant execute on function public.create_mirror_collab_calendar_events(text, timestamptz, timestamptz, uuid[]) to authenticated;

revoke all on function public.delete_mirror_calendar_event_group(uuid) from public;
grant execute on function public.delete_mirror_calendar_event_group(uuid) to authenticated;
