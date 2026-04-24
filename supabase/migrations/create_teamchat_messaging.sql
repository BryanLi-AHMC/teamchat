create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('dm', 'group')),
  title text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_members_user_id
  on public.conversation_members(user_id);

create index if not exists idx_messages_conversation_id_created_at
  on public.messages(conversation_id, created_at);

create or replace function public.set_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_conversations_updated_at on public.conversations;

create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_conversations_updated_at();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversations_select_member" on public.conversations;
drop policy if exists "conversations_insert_authenticated" on public.conversations;
drop policy if exists "conversation_members_select_member" on public.conversation_members;
drop policy if exists "conversation_members_insert_creator_or_member" on public.conversation_members;
drop policy if exists "messages_select_member" on public.messages;
drop policy if exists "messages_insert_member" on public.messages;
drop policy if exists "internal_profiles_select_active_users" on public.internal_profiles;

create policy "conversations_select_member"
on public.conversations
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversations.id
      and cm.user_id = auth.uid()
  )
);

create policy "conversations_insert_authenticated"
on public.conversations
for insert
to authenticated
with check (created_by = auth.uid());

create policy "conversation_members_select_member"
on public.conversation_members
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversation_members.conversation_id
      and cm.user_id = auth.uid()
  )
);

create policy "conversation_members_insert_creator_or_member"
on public.conversation_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_members.conversation_id
      and c.created_by = auth.uid()
  )
  or exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversation_members.conversation_id
      and cm.user_id = auth.uid()
  )
);

create policy "messages_select_member"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = auth.uid()
  )
);

create policy "messages_insert_member"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = auth.uid()
  )
);

create policy "internal_profiles_select_active_users"
on public.internal_profiles
for select
to authenticated
using (is_active = true);

create or replace function public.get_or_create_dm(target_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  found_conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid target user';
  end if;

  if not exists (
    select 1
    from public.internal_profiles ip
    where ip.id = target_user_id
      and ip.is_active = true
  ) then
    raise exception 'Target user is not active';
  end if;

  select c.id
  into found_conversation_id
  from public.conversations c
  join public.conversation_members me
    on me.conversation_id = c.id
   and me.user_id = current_user_id
  join public.conversation_members them
    on them.conversation_id = c.id
   and them.user_id = target_user_id
  where c.type = 'dm'
    and (
      select count(*)
      from public.conversation_members cm
      where cm.conversation_id = c.id
    ) = 2
  order by c.created_at asc
  limit 1;

  if found_conversation_id is not null then
    return found_conversation_id;
  end if;

  insert into public.conversations(type, title, created_by)
  values ('dm', null, current_user_id)
  returning id into found_conversation_id;

  insert into public.conversation_members(conversation_id, user_id)
  values
    (found_conversation_id, current_user_id),
    (found_conversation_id, target_user_id)
  on conflict do nothing;

  return found_conversation_id;
end;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;
