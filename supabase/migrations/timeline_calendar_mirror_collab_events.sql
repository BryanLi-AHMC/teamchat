-- When someone schedules a collab/meeting with teammates, insert the same time block
-- on every participant's calendar (each row is owned by that user for RLS updates/deletes).

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
    insert into public.timeline_calendar_events (user_id, title, starts_at, ends_at, collaborator_user_ids)
    values (pid, t, p_starts_at, p_ends_at, coalesce(other_ids, array[]::uuid[]))
    returning * into inserted_row;

    if pid = organizer then
      org_row := inserted_row;
    end if;
  end loop;

  return row_to_json(org_row);
end;
$$;

revoke all on function public.create_mirror_collab_calendar_events(text, timestamptz, timestamptz, uuid[]) from public;
grant execute on function public.create_mirror_collab_calendar_events(text, timestamptz, timestamptz, uuid[]) to authenticated;
