-- Unread counts for sidebar badges: messages from others strictly after the member's read cursor.

create or replace function public.unread_message_counts_for_conversations(p_conversation_ids uuid[])
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.conversation_id,
    count(*)::bigint as unread_count
  from public.messages m
  join public.conversation_members me
    on me.conversation_id = m.conversation_id
   and me.user_id = auth.uid()
  left join public.messages r
    on r.id = me.last_read_message_id
  where
    m.conversation_id = any(p_conversation_ids)
    and m.sender_id <> auth.uid()
    and (
      me.last_read_message_id is null
      or m.created_at > r.created_at
      or (m.created_at = r.created_at and m.id > r.id)
    )
  group by m.conversation_id;
$$;

grant execute on function public.unread_message_counts_for_conversations(uuid[]) to authenticated;
