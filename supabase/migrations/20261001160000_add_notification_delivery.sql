create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web', 'expo')),
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_devices_user_platform_idx
  on public.notification_devices (user_id, platform);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('saved_look_reminder', 'weather_change')),
  source_id text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled', 'expired')),
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, source_id)
);

create index if not exists notification_jobs_due_idx
  on public.notification_jobs (status, scheduled_at);
create index if not exists notification_jobs_user_created_idx
  on public.notification_jobs (user_id, created_at desc);

alter table public.notification_devices enable row level security;
alter table public.notification_jobs enable row level security;

drop policy if exists notification_devices_select_own on public.notification_devices;
drop policy if exists notification_devices_insert_own on public.notification_devices;
drop policy if exists notification_devices_update_own on public.notification_devices;
drop policy if exists notification_devices_delete_own on public.notification_devices;

create policy notification_devices_select_own on public.notification_devices
  for select using ((select auth.uid()) = user_id);
create policy notification_devices_insert_own on public.notification_devices
  for insert with check ((select auth.uid()) = user_id);
create policy notification_devices_update_own on public.notification_devices
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy notification_devices_delete_own on public.notification_devices
  for delete using ((select auth.uid()) = user_id);

drop policy if exists notification_jobs_select_own on public.notification_jobs;
drop policy if exists notification_jobs_insert_own on public.notification_jobs;
drop policy if exists notification_jobs_update_own on public.notification_jobs;
drop policy if exists notification_jobs_delete_own on public.notification_jobs;

create policy notification_jobs_select_own on public.notification_jobs
  for select using ((select auth.uid()) = user_id);
create policy notification_jobs_insert_own on public.notification_jobs
  for insert with check ((select auth.uid()) = user_id and status = 'pending');
create policy notification_jobs_update_own on public.notification_jobs
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy notification_jobs_delete_own on public.notification_jobs
  for delete using ((select auth.uid()) = user_id);

create or replace function public.register_notification_device(
  p_platform text,
  p_endpoint text,
  p_subscription jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  device_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before registering a notification device.';
  end if;
  if p_platform not in ('web', 'expo') or p_endpoint is null or length(p_endpoint) > 2048 then
    raise exception 'Invalid notification device.';
  end if;
  if jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'A valid notification subscription is required.';
  end if;

  delete from public.notification_devices
  where endpoint = p_endpoint;

  insert into public.notification_devices (user_id, platform, endpoint, subscription)
  values (current_user_id, p_platform, p_endpoint, p_subscription)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        subscription = excluded.subscription,
        updated_at = now()
  returning id into device_id;

  return device_id;
end;
$$;

revoke all on function public.register_notification_device(text, text, jsonb) from public, anon;
grant execute on function public.register_notification_device(text, text, jsonb) to authenticated;

create or replace function public.claim_due_notification_jobs(
  p_now timestamptz,
  p_limit integer default 20
)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due_jobs as (
    select id
    from public.notification_jobs
    where (
      (status = 'pending' and scheduled_at <= p_now)
      or
      (status = 'processing' and updated_at < p_now - interval '10 minutes')
    )
    order by scheduled_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.notification_jobs as job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      last_attempt_at = p_now,
      updated_at = p_now
  from due_jobs
  where job.id = due_jobs.id
  returning job.*;
end;
$$;

revoke all on function public.claim_due_notification_jobs(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_due_notification_jobs(timestamptz, integer) to service_role;