-- Imported watch activities (Garmin). One row per activity; re-importing never duplicates.
-- Strength-at-the-gym sessions live only here; skiing, running, biking and hiking also become log entries.
create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source       text not null default 'garmin',
  external_id  text not null,                -- the file name stem, e.g. 2026-11-21-08-38-14
  date         date not null,                -- local day
  started_at   timestamptz,
  sport        int,
  sub_sport    int,
  name         text not null default '',     -- the watch's profile name: Strength, Ski, MTB, Run ...
  seconds      int,
  meters       real,
  ascent_m     real,
  descent_m    real,
  avg_hr       int,
  max_hr       int,
  calories     int,
  log_entry_id uuid references public.log_entries(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index activities_user_date on public.activities (user_id, date);
alter table public.activities enable row level security;
create policy "own activities" on public.activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
