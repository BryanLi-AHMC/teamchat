-- Calendar position for daily updates (editable); created_at stays audit trail.
alter table public.user_updates
  add column if not exists display_at timestamptz;

update public.user_updates
set display_at = coalesce(display_at, created_at);

alter table public.user_updates
  alter column display_at set not null,
  alter column display_at set default now();

create index if not exists idx_user_updates_user_display_at
  on public.user_updates(user_id, display_at desc);
