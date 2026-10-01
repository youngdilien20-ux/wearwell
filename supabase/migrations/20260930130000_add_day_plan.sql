alter table public.user_settings
  add column if not exists day_plan jsonb not null default '{"events":[]}'::jsonb;