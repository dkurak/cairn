-- Cairn 0006: training goals the coach keeps in mind (set in chat, shown on the Plan page).
alter table public.profiles
  add column if not exists goals text not null default '',
  add column if not exists goals_updated_at timestamptz;
