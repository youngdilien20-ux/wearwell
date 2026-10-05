alter table public.wardrobe_items
  add column if not exists visual_attributes jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wardrobe_items_visual_attributes_object'
      and conrelid = 'public.wardrobe_items'::regclass
  ) then
    alter table public.wardrobe_items
      add constraint wardrobe_items_visual_attributes_object
      check (jsonb_typeof(visual_attributes) = 'object');
  end if;
end $$;