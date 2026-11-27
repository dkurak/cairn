-- Cairn 0005: workout version history + what's on the watch (Garmin exports).

-- every workout carries a version that bumps whenever what you'd do changes
alter table public.workouts
  add column version int not null default 1,
  add column change_note text not null default '';   -- why it changed (the coach's reason); copied into history

create table public.workout_versions (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  version      int not null,
  name         text not null,
  category     text not null,
  rundown      jsonb,
  steps        jsonb not null default '[]',
  notes        text not null default '',
  change_note  text not null default '',
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now(),
  unique (workout_id, version)
);
create index workout_versions_workout_idx on public.workout_versions(workout_id, version desc);

-- bump on real changes only (a no-op save doesn't make a new version)
create or replace function public.workouts_bump_version() returns trigger
language plpgsql as $$
begin
  if (new.name, new.category, new.rundown, new.steps, new.notes) is distinct from (old.name, old.category, old.rundown, old.steps, old.notes) then
    new.version := old.version + 1;
    -- a note belongs to one change: don't carry the last one forward
    if new.change_note is not distinct from old.change_note then new.change_note := ''; end if;
  else
    new.version := old.version;
  end if;
  return new;
end $$;
create trigger workouts_version before update on public.workouts
  for each row execute function public.workouts_bump_version();

-- snapshot each version. security definer: the history table has no insert policy
create or replace function public.workouts_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.workout_versions (workout_id, version, name, category, rundown, steps, notes, change_note, changed_by)
    values (new.id, new.version, new.name, new.category, new.rundown, new.steps, new.notes, new.change_note, coalesce(new.updated_by, auth.uid()))
    on conflict (workout_id, version) do nothing;
  end if;
  return null;
end $$;
create trigger workouts_snapshot after insert or update on public.workouts
  for each row execute function public.workouts_snapshot();

-- history for workouts that already exist: version 1 = how they are today
insert into public.workout_versions (workout_id, version, name, category, rundown, steps, notes, change_note, changed_by, changed_at)
select id, version, name, category, rundown, steps, notes, 'Starting version', updated_by, updated_at from public.workouts
on conflict do nothing;

-- which version of each workout a person last downloaded for their watch
create table public.garmin_exports (
  user_id      uuid not null references auth.users(id) on delete cascade,
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  version      int not null,
  exported_at  timestamptz not null default now(),
  primary key (user_id, workout_id)
);

alter table public.workout_versions enable row level security;
alter table public.garmin_exports enable row level security;
-- you can read the history of any workout you can read
create policy workout_versions_select on public.workout_versions for select
  using (exists (select 1 from public.workouts w where w.id = workout_id and (w.owner_id is null or w.owner_id = auth.uid() or public.is_admin())));
create policy garmin_exports_all on public.garmin_exports for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- the admin's watch already has the original set (built with garmin/build_all.py): that's version 1
insert into public.garmin_exports (user_id, workout_id, version, exported_at)
select p.id, w.id, 1, now() from public.profiles p cross join public.workouts w
where p.role = 'admin' and w.owner_id is null
on conflict do nothing;
