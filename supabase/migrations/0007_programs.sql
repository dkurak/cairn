-- Cairn 0007: goal programs. A bank of goals ("ready for a big ski day Jan 18", "swim long distances at the
-- beach", "ski all day anytime", "add muscle"), each with phases and preferences. One active program drives
-- the weekly plan; the coach writes each week from the program's current phase.

create table public.programs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  goal           text not null default '',                 -- in their words
  kind           text not null check (kind in ('event','ongoing')),
  target_date    date,                                     -- the event day (kind = event)
  start_date     date,                                     -- set when it becomes active
  weeks          int check (weeks between 1 and 52),       -- length; null = open-ended
  days_per_week  int check (days_per_week between 1 and 7),
  status         text not null default 'idea' check (status in ('idea','active','paused','done')),
  phases         jsonb not null default '[]',              -- [{name, weeks, focus}]
  preferences    jsonb not null default '{}',              -- {session_minutes, variety, rest_days, equipment, limits}
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index programs_user_idx on public.programs(user_id, status);
create unique index programs_one_active on public.programs(user_id) where status = 'active';
create trigger programs_updated before update on public.programs
  for each row execute function public.set_updated_at();

-- which program week a weekly plan was written for
alter table public.plans
  add column program_id uuid references public.programs(id) on delete set null,
  add column program_week int;

alter table public.programs enable row level security;
create policy programs_all on public.programs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
