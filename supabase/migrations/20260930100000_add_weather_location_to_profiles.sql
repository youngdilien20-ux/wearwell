alter table public.profiles
  add column if not exists weather_location jsonb not null default '{}'::jsonb;
