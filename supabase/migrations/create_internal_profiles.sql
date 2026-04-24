create table if not exists public.internal_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text not null,
  role text not null default 'internal',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.internal_profiles enable row level security;

drop policy if exists "internal_profiles_select_own" on public.internal_profiles;
drop policy if exists "internal_profiles_service_role_manage" on public.internal_profiles;

create policy "internal_profiles_select_own"
on public.internal_profiles
for select
to authenticated
using (auth.uid() = id);

create policy "internal_profiles_service_role_manage"
on public.internal_profiles
for all
to service_role
using (true)
with check (true);

create or replace function public.set_internal_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_internal_profiles_updated_at on public.internal_profiles;

create trigger set_internal_profiles_updated_at
before update on public.internal_profiles
for each row
execute function public.set_internal_profiles_updated_at();
