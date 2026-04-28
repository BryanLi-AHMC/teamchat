alter table public.internal_profiles
  add column if not exists xp_total integer not null default 0,
  add column if not exists points integer not null default 0,
  add column if not exists level integer not null default 1,
  add column if not exists streak integer not null default 0,
  add column if not exists last_xp_awarded_date date;

update public.internal_profiles
set
  xp_total = greatest(0, coalesce(xp_total, 0)),
  points = greatest(0, coalesce(points, coalesce(xp_total, 0))),
  level = greatest(1, coalesce(level, 1)),
  streak = greatest(0, coalesce(streak, 0))
where true;
