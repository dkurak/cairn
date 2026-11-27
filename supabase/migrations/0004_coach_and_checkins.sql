-- Cairn 0004: saved coach conversations + one-tap daily "how are you feeling" check-ins.

create table public.daily_checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  feel        text not null check (feel in ('Rough','OK','Good','Great')),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

create table public.coach_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('user','assistant','act')),
  content          text not null default '',
  proposal         jsonb,                                   -- workout/plan suggestion card, if any
  proposal_status  text check (proposal_status in ('open','saved','discarded')),
  created_at       timestamptz not null default now()
);
create index coach_messages_user_idx on public.coach_messages(user_id, created_at desc);

alter table public.daily_checkins enable row level security;
alter table public.coach_messages enable row level security;
create policy daily_checkins_all on public.daily_checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy coach_messages_all on public.coach_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
