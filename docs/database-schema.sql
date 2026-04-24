-- TeamChat initial Supabase Postgres schema draft
-- Note: execute in Supabase SQL editor after review.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  email text unique,
  display_name text,
  avatar_url text,
  role text default 'member',
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id),
  group_id uuid references public.groups(id),
  recipient_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.progress_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  project text,
  completed text,
  working_on text,
  blockers text,
  next_steps text,
  update_date date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_messages_group_created_at
  on public.messages(group_id, created_at);

create index if not exists idx_messages_recipient_created_at
  on public.messages(recipient_id, created_at);

create index if not exists idx_progress_updates_update_date
  on public.progress_updates(update_date);

create index if not exists idx_group_members_group_id
  on public.group_members(group_id);

create index if not exists idx_group_members_user_id
  on public.group_members(user_id);
