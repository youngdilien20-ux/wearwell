alter table public.wear_history
  add column if not exists event_id text,
  add column if not exists event_label text;