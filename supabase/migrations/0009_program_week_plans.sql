-- Cairn 0009: plan ahead. A program week can be a DRAFT (planned in advance, not the live plan yet) or LIVE
-- (it is, or was, the plan you're following). Every change to a week's plan is kept as a revision, so you can
-- see how the program changed as you did (or missed) things. Mirrors workout versions (0005).

alter table public.program_weeks
  add column status   text not null default 'live' check (status in ('draft','live')),
  add column revision int  not null default 1,
  add column note     text not null default '';   -- why this version was written (the coach's reason); copied into history

create table public.program_week_versions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  program_week_id  uuid not null references public.program_weeks(id) on delete cascade,
  revision         int  not null,
  status           text not null,
  items            jsonb not null default '[]',
  note             text not null default '',
  changed_at       timestamptz not null default now(),
  unique (program_week_id, revision)
);
create index program_week_versions_week_idx on public.program_week_versions(program_week_id, revision desc);

alter table public.program_week_versions enable row level security;
create policy program_week_versions_select on public.program_week_versions for select using (user_id = auth.uid());

-- bump the revision on real changes only (a no-op save, or draft -> live with the same plan, doesn't make a new one)
create or replace function public.program_weeks_bump_revision() returns trigger
language plpgsql as $$
begin
  if new.items is distinct from old.items then
    new.revision := old.revision + 1;
    -- a note belongs to one change: don't carry the last one forward
    if new.note is not distinct from old.note then new.note := ''; end if;
  else
    new.revision := old.revision;
  end if;
  return new;
end $$;
create trigger program_weeks_revision before update on public.program_weeks
  for each row execute function public.program_weeks_bump_revision();

-- snapshot each revision. security definer: the history table has no insert policy
create or replace function public.program_weeks_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.revision <> old.revision then
    insert into public.program_week_versions (user_id, program_week_id, revision, status, items, note)
    values (new.user_id, new.id, new.revision, new.status, new.items, new.note)
    on conflict (program_week_id, revision) do nothing;
  end if;
  return null;
end $$;
create trigger program_weeks_snapshot after insert or update on public.program_weeks
  for each row execute function public.program_weeks_snapshot();

-- history for weeks that already exist: revision 1 = how they are today
insert into public.program_week_versions (user_id, program_week_id, revision, status, items, note, changed_at)
select user_id, id, revision, status, items, 'Starting version', updated_at from public.program_weeks
on conflict do nothing;
