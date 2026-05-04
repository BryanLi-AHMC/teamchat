-- Per-member read cursor for conversations (read receipts + future unread math).
alter table public.conversation_members
  add column if not exists last_read_message_id uuid references public.messages(id) on delete set null;

create index if not exists idx_conversation_members_last_read_message_id
  on public.conversation_members(last_read_message_id)
  where last_read_message_id is not null;

drop policy if exists "conversation_members_update_own_read" on public.conversation_members;

create policy "conversation_members_update_own_read"
on public.conversation_members
for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversation_members.conversation_id
      and cm.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = conversation_members.conversation_id
      and cm.user_id = auth.uid()
  )
);
