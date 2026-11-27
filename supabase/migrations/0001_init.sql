-- Cairn Phase 1 schema. PROPOSAL - not applied yet.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  role          text not null default 'member' check (role in ('admin','member')),
  created_at    timestamptz not null default now()
);

-- security definer so policies can ask "is this user admin?" without recursing into profiles RLS
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- workouts ----------
create table public.workouts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null,                       -- SKI, CC, TRV, STR, EZ, SURF, ...
  owner_id    uuid references auth.users(id) on delete cascade,  -- null = shared library
  steps       jsonb not null default '[]',         -- Garmin-style steps/repeats/rests (data/workouts.json)
  rundown     jsonb,                               -- display tiles (data/workout_rundowns.json)
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
create index workouts_owner_idx on public.workouts(owner_id);
create unique index workouts_shared_name_uq on public.workouts(name) where owner_id is null;
create unique index workouts_private_name_uq on public.workouts(owner_id, name) where owner_id is not null;
create trigger workouts_updated before update on public.workouts
  for each row execute function public.set_updated_at();

-- ---------- plans ----------
-- owner_id null = shared template (admin-managed). New users get a private copy on signup.
create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('home','travel','calm')),
  -- [{key, day, title, workout_ids[], kind: 'workout'|'tour'|'rest', note, cycle?}]
  items       jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);
create index plans_owner_idx on public.plans(owner_id);
create trigger plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

-- ---------- plan_state ----------
create table public.plan_state (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  phase                 text not null default 'calm' check (phase in ('calm','build')),
  travel                boolean not null default false,
  active_home_plan_id   uuid references public.plans(id) on delete set null,
  active_travel_plan_id uuid references public.plans(id) on delete set null,
  done                  jsonb not null default '{}',   -- {item_key: 'YYYY-MM-DD' | 'skipped'}
  travel_done           jsonb not null default '{}',
  week                  int  not null default 1,
  updated_at            timestamptz not null default now()
);
create trigger plan_state_updated before update on public.plan_state
  for each row execute function public.set_updated_at();

-- ---------- log_entries ----------
create table public.log_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  kind          text not null check (kind in ('workout','tour','rest','hip_check')),
  workout_id    uuid references public.workouts(id) on delete set null,
  what          text not null,                     -- display name, kept even if the workout is deleted
  pain_during   smallint check (pain_during between 0 and 10),
  pain_next_am  smallint check (pain_next_am between 0 and 10),
  hip_pain      smallint check (hip_pain between 0 and 10),   -- hip_check rows
  feel          text check (feel in ('Rough','OK','Good','Great')),
  vert_ft       int check (vert_ft >= 0),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index log_user_date_idx on public.log_entries(user_id, date desc, created_at desc);
-- one hip check per user per day (the app upserts)
create unique index log_one_hip_check_per_day on public.log_entries(user_id, date) where kind = 'hip_check';
create trigger log_updated before update on public.log_entries
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.profiles    enable row level security;
alter table public.workouts    enable row level security;
alter table public.plans       enable row level security;
alter table public.plan_state  enable row level security;
alter table public.log_entries enable row level security;

-- profiles: read your own (admin reads all), edit your own display name but never your own role
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- workouts: shared readable by everyone; shared writable by admin; private by owner
create policy workouts_select on public.workouts for select
  using (owner_id is null or owner_id = auth.uid());
create policy workouts_insert on public.workouts for insert
  with check (owner_id = auth.uid() or (owner_id is null and public.is_admin()));
create policy workouts_update on public.workouts for update
  using (owner_id = auth.uid() or (owner_id is null and public.is_admin()))
  with check (owner_id = auth.uid() or (owner_id is null and public.is_admin()));
create policy workouts_delete on public.workouts for delete
  using (owner_id = auth.uid() or (owner_id is null and public.is_admin()));

-- plans: own only, plus read-only access to shared templates
create policy plans_select on public.plans for select using (owner_id = auth.uid() or owner_id is null);
create policy plans_insert on public.plans for insert with check (owner_id = auth.uid() or (owner_id is null and public.is_admin()));
create policy plans_update on public.plans for update
  using (owner_id = auth.uid() or (owner_id is null and public.is_admin()))
  with check (owner_id = auth.uid() or (owner_id is null and public.is_admin()));
create policy plans_delete on public.plans for delete using (owner_id = auth.uid() or (owner_id is null and public.is_admin()));

-- plan_state + log: strictly your own
create policy plan_state_all on public.plan_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy log_all        on public.log_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- new user bootstrap ----------
-- On signup: profile (member), private copies of the shared template plans, plan_state in calm phase.
-- Admin promotion for ADMIN_EMAIL happens in the seed script (needs the service role), not here.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare home_id uuid; travel_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Friend'));

  insert into public.plans (owner_id, name, kind, items)
  select new.id, name, kind, items from public.plans where owner_id is null;

  select id into home_id   from public.plans where owner_id = new.id and kind = 'home'   limit 1;
  select id into travel_id from public.plans where owner_id = new.id and kind = 'travel' limit 1;

  insert into public.plan_state (user_id, active_home_plan_id, active_travel_plan_id)
  values (new.id, home_id, travel_id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
