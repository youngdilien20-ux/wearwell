alter table public.wardrobe_items
  add column if not exists client_key text;

update public.wardrobe_items
set client_key = id::text
where client_key is null;

alter table public.wardrobe_items
  alter column client_key set default gen_random_uuid()::text;

alter table public.wardrobe_items
  alter column client_key set not null;

create unique index if not exists wardrobe_items_user_client_key_idx
  on public.wardrobe_items (user_id, client_key);