-- Keep auth checks initPlan-friendly so RLS evaluates auth.uid() once per statement.
-- Data ownership and policy scope remain unchanged.

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles
  for delete using ((select auth.uid()) = id);

drop policy if exists wardrobe_items_select_own on public.wardrobe_items;
drop policy if exists wardrobe_items_insert_own on public.wardrobe_items;
drop policy if exists wardrobe_items_update_own on public.wardrobe_items;
drop policy if exists wardrobe_items_delete_own on public.wardrobe_items;

create policy wardrobe_items_select_own on public.wardrobe_items
  for select using ((select auth.uid()) = user_id);
create policy wardrobe_items_insert_own on public.wardrobe_items
  for insert with check ((select auth.uid()) = user_id);
create policy wardrobe_items_update_own on public.wardrobe_items
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy wardrobe_items_delete_own on public.wardrobe_items
  for delete using ((select auth.uid()) = user_id);
