-- Web content assets bucket + a dedicated Legal page row.
--
-- - `web-content` storage bucket holds images uploaded through the Web CMS.
--   Public read (the marketing site loads them directly); superadmin-only writes.
-- - Adds a 'legal' row to web_content so Terms & Conditions and Privacy Policy
--   are managed as their own page and read at /terms and /privacy.
--
-- Non-destructive: only creates a bucket, policies, and one seed row.

begin;

set search_path = public;

-- -- Assets bucket --------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('web-content', 'web-content', true)
on conflict (id) do update set public = true;

drop policy if exists "web-content public read" on storage.objects;
create policy "web-content public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'web-content');

drop policy if exists "web-content superadmin insert" on storage.objects;
create policy "web-content superadmin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'web-content' and public.is_superadmin(auth.uid()));

drop policy if exists "web-content superadmin update" on storage.objects;
create policy "web-content superadmin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'web-content' and public.is_superadmin(auth.uid()))
  with check (bucket_id = 'web-content' and public.is_superadmin(auth.uid()));

drop policy if exists "web-content superadmin delete" on storage.objects;
create policy "web-content superadmin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'web-content' and public.is_superadmin(auth.uid()));

-- -- Legal page row -------------------------------------------------------------
insert into public.web_content (page, content, description) values
  ('legal', '{}'::jsonb, 'Legal pages: Terms & Conditions and Privacy Policy (read at /terms and /privacy).')
on conflict (page) do nothing;

commit;
