create or replace function public.is_ari_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.internal_profiles ip
    where ip.id = target_user_id
      and ip.is_active = true
      and (
        lower(ip.email) = 'ariwang@portal.local'
        or ip.display_name = 'Ari Wang'
      )
  );
$$;

create or replace function public.add_group_members(target_conversation_id uuid, target_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  if target_user_ids is null or coalesce(array_length(target_user_ids, 1), 0) = 0 then
    return;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = add_group_members.target_conversation_id
      and c.type = 'group'
  ) then
    raise exception 'Conversation is not a group';
  end if;

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = add_group_members.target_conversation_id
      and cm.user_id = current_user_id
  ) then
    raise exception 'Only group members can add people';
  end if;

  if exists (
    select 1
    from unnest(target_user_ids) as candidate_user_id
    left join public.internal_profiles ip
      on ip.id = candidate_user_id
    where ip.id is null
      or ip.is_active is distinct from true
  ) then
    raise exception 'All invited users must be active internal users';
  end if;

  insert into public.conversation_members(conversation_id, user_id)
  select add_group_members.target_conversation_id, distinct_user_id
  from (
    select distinct candidate_user_id as distinct_user_id
    from unnest(target_user_ids) as candidate_user_id
    where candidate_user_id is not null
  ) deduped
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

create or replace function public.remove_group_member(target_conversation_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  creator_user_id uuid;
  conversation_type text;
  current_user_is_ari boolean;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_conversation_id is null or target_user_id is null then
    raise exception 'Conversation and target user are required';
  end if;

  select c.created_by, c.type
  into creator_user_id, conversation_type
  from public.conversations c
  where c.id = remove_group_member.target_conversation_id;

  if creator_user_id is null then
    raise exception 'Conversation not found';
  end if;

  if conversation_type <> 'group' then
    raise exception 'Cannot remove members from a direct message';
  end if;

  current_user_is_ari := public.is_ari_user(current_user_id);

  if current_user_id <> creator_user_id and not current_user_is_ari then
    raise exception 'Only the group creator or Ari can remove members';
  end if;

  if target_user_id = creator_user_id and not current_user_is_ari then
    raise exception 'Only Ari can remove the group creator';
  end if;

  delete from public.conversation_members cm
  where cm.conversation_id = remove_group_member.target_conversation_id
    and cm.user_id = remove_group_member.target_user_id;
end;
$$;

create or replace function public.dissolve_group(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  creator_user_id uuid;
  conversation_type text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_conversation_id is null then
    raise exception 'Conversation is required';
  end if;

  select c.created_by, c.type
  into creator_user_id, conversation_type
  from public.conversations c
  where c.id = dissolve_group.target_conversation_id;

  if creator_user_id is null then
    raise exception 'Conversation not found';
  end if;

  if conversation_type <> 'group' then
    raise exception 'Only groups can be dissolved';
  end if;

  if current_user_id <> creator_user_id and not public.is_ari_user(current_user_id) then
    raise exception 'Only the group creator or Ari can dissolve this group';
  end if;

  delete from public.conversations c
  where c.id = dissolve_group.target_conversation_id;
end;
$$;

revoke all on function public.is_ari_user(uuid) from public;
revoke all on function public.add_group_members(uuid, uuid[]) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.dissolve_group(uuid) from public;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.dissolve_group(uuid) to authenticated;
