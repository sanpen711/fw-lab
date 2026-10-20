-- Visitors can browse only content explicitly published by administrators.
-- Private data and all write permissions retain their existing policies.
grant select on public.site_announcements,public.site_activities,public.shop_products to anon;
create policy site_announcements_guest_read on public.site_announcements
  for select to anon using (is_published and deleted_at is null);
create policy site_activities_guest_read on public.site_activities
  for select to anon using (is_published and deleted_at is null);
create policy shop_products_guest_read on public.shop_products
  for select to anon using (is_active and deleted_at is null);
