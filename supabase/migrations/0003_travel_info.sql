-- Cairn 0003: remember what a trip looks like (gym or bodyweight, jogging, return date).
alter table public.plan_state add column if not exists travel_info jsonb not null default '{}';
-- shape: {"gear": "gym" | "bodyweight", "jog": true|false, "returns": "YYYY-MM-DD"}
