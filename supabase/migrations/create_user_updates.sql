create table if not exists public.user_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_updates_user_created_at
  on public.user_updates(user_id, created_at desc);

create or replace function public.set_user_updates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_updates_updated_at on public.user_updates;

create trigger set_user_updates_updated_at
before update on public.user_updates
for each row
execute function public.set_user_updates_updated_at();

alter table public.user_updates enable row level security;

drop policy if exists "user_updates_select_active_internal_users" on public.user_updates;
drop policy if exists "user_updates_insert_own" on public.user_updates;
drop policy if exists "user_updates_update_own" on public.user_updates;
drop policy if exists "user_updates_delete_own" on public.user_updates;

create policy "user_updates_select_active_internal_users"
on public.user_updates
for select
to authenticated
using (
  exists (
    select 1
    from public.internal_profiles ip
    where ip.id = user_updates.user_id
      and ip.is_active = true
  )
);

create policy "user_updates_insert_own"
on public.user_updates
for insert
to authenticated
with check (
  user_id = auth.uid()
);

create policy "user_updates_update_own"
on public.user_updates
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "user_updates_delete_own"
on public.user_updates
for delete
to authenticated
using (user_id = auth.uid());
