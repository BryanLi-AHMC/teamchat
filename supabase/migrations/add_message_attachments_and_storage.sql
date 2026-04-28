alter table if exists public.messages
  add column if not exists message_type text not null default 'text' check (message_type in ('text', 'image', 'file')),
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size bigint;

create index if not exists idx_messages_conversation_id
  on public.messages(conversation_id);

create index if not exists idx_messages_created_at
  on public.messages(created_at);

create index if not exists idx_messages_sender_id
  on public.messages(sender_id);

insert into storage.buckets (id, name, public)
values ('teamchat-attachments', 'teamchat-attachments', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "attachments_insert_own" on storage.objects;
drop policy if exists "attachments_select_member" on storage.objects;

create policy "attachments_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'teamchat-attachments'
  and split_part(name, '/', 2) = auth.uid()::text
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = split_part(name, '/', 1)
      and cm.user_id = auth.uid()
  )
);

create policy "attachments_select_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'teamchat-attachments'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = split_part(name, '/', 1)
      and cm.user_id = auth.uid()
  )
);
