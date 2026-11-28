-- Cairn 0008: keep every week of a program, so a week can be looked at later (and planned ahead).
-- Until now the weekly plan was one row that got overwritten each week. Now each time a plan is written
-- for a program week, a copy is kept here, one row per (program, week).

create table public.program_weeks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  program_id  uuid not null references public.programs(id) on delete cascade,
  week        int  not null check (week >= 1),
  plan_kind   text not null default 'home' check (plan_kind in ('home','travel')),
  items       jsonb not null default '[]',      -- same shape as plans.items
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (program_id, week)
);
create index program_weeks_user_idx on public.program_weeks(user_id, program_id, week);
create trigger program_weeks_updated before update on public.program_weeks
  for each row execute function public.set_updated_at();

alter table public.program_weeks enable row level security;
create policy program_weeks_all on public.program_weeks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- keep what's already written for a program week today
insert into public.program_weeks (user_id, program_id, week, plan_kind, items)
select owner_id, program_id, program_week, kind, items
from public.plans
where program_id is not null and program_week is not null and kind in ('home','travel') and owner_id is not null
on conflict (program_id, week) do nothing;
