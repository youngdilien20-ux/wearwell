create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'Work',
  brief text not null default '',
  options integer not null default 3 check (options in (2, 3)),
  selected_outfit_id text,
  day_brief jsonb not null default '{}'::jsonb,
  day_plan jsonb not null default '{"events":[]}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wear_history (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  outfit_id text not null,
  outfit_name text not null,
  item_ids jsonb not null default '[]'::jsonb,
  item_names jsonb not null default '[]'::jsonb,
  reason text not null default '',
  weather text not null default '',
  formality text not null default '',
  day_brief jsonb not null default '{}'::jsonb,
  feedback jsonb not null default '{}'::jsonb
);

create index if not exists wear_history_user_created_at_idx
  on public.wear_history (user_id, created_at desc);

alter table public.user_settings enable row level security;
alter table public.wear_history enable row level security;

drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;
drop policy if exists user_settings_delete_own on public.user_settings;

create policy user_settings_select_own on public.user_settings
  for select using ((select auth.uid()) = user_id);
create policy user_settings_insert_own on public.user_settings
  for insert with check ((select auth.uid()) = user_id);
create policy user_settings_update_own on public.user_settings
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_settings_delete_own on public.user_settings
  for delete using ((select auth.uid()) = user_id);

drop policy if exists wear_history_select_own on public.wear_history;
drop policy if exists wear_history_insert_own on public.wear_history;
drop policy if exists wear_history_update_own on public.wear_history;
drop policy if exists wear_history_delete_own on public.wear_history;

create policy wear_history_select_own on public.wear_history
  for select using ((select auth.uid()) = user_id);
create policy wear_history_insert_own on public.wear_history
  for insert with check ((select auth.uid()) = user_id);
create policy wear_history_update_own on public.wear_history
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy wear_history_delete_own on public.wear_history
  for delete using ((select auth.uid()) = user_id);