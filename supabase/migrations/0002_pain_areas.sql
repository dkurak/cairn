-- Cairn 0002: track pain for any body area, and stop copying Dave's plans to new users.
-- Run in the Supabase SQL Editor after 0001.

-- ---------- pain areas + daily checks ----------
create table public.pain_areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,                         -- "Right hip flexor", "Low back", "Left shoulder"
  is_primary  boolean not null default false,        -- the one that drives tour/calm rules
  active      boolean not null default true,         -- hide an area once it's resolved, keep its history
  created_at  timestamptz not null default now()
);
create unique index pain_areas_user_name_uq on public.pain_areas(user_id, lower(name));
create unique index pain_areas_one_primary on public.pain_areas(user_id) where is_primary;

create table public.pain_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  area_id     uuid not null references public.pain_areas(id) on delete cascade,
  date        date not null,
  pain        smallint not null check (pain between 0 and 10),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (area_id, date)                             -- one number per area per day; the app upserts
);
create index pain_checks_user_date_idx on public.pain_checks(user_id, date desc);
create trigger pain_checks_updated before update on public.pain_checks
  for each row execute function public.set_updated_at();

alter table public.pain_areas  enable row level security;
alter table public.pain_checks enable row level security;
create policy pain_areas_all  on public.pain_areas  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pain_checks_all on public.pain_checks for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- move old hip checks (if any) into the new tables ----------
insert into public.pain_areas (user_id, name, is_primary)
select distinct user_id, 'Right hip flexor', true from public.log_entries where kind = 'hip_check'
on conflict do nothing;

insert into public.pain_checks (user_id, area_id, date, pain)
select l.user_id, a.id, l.date, l.hip_pain
from public.log_entries l
join public.pain_areas a on a.user_id = l.user_id and lower(a.name) = 'right hip flexor'
where l.kind = 'hip_check' and l.hip_pain is not null
on conflict (area_id, date) do nothing;

delete from public.log_entries where kind = 'hip_check';
drop index if exists public.log_one_hip_check_per_day;
alter table public.log_entries drop constraint if exists log_entries_kind_check;
alter table public.log_entries add constraint log_entries_kind_check check (kind in ('workout','tour','rest'));
alter table public.log_entries drop column if exists hip_pain;

-- ---------- plans are private; new users start empty ----------
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select using (owner_id = auth.uid());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare home_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Friend'));

  -- empty weekly plan; the coach builds it with them (no copy of anyone else's plan)
  insert into public.plans (owner_id, name, kind, items) values (new.id, 'My week', 'home', '[]') returning id into home_id;

  insert into public.plan_state (user_id, phase, active_home_plan_id) values (new.id, 'build', home_id);
  return new;
end $$;
