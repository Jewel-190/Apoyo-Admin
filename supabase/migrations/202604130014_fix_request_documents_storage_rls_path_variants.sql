-- Make request-documents storage RLS robust across different client path layouts.
-- Keeps ownership enforcement strict via owner_id/auth.uid, with path fallbacks.

drop policy if exists "Users can read own request documents" on storage.objects;
drop policy if exists "Users can upload own request documents" on storage.objects;
drop policy if exists "Users can update own request documents" on storage.objects;
drop policy if exists "Users can delete own request documents" on storage.objects;

create policy "Users can read own request documents"
  on storage.objects
  for select
  using (
    bucket_id = 'request-documents'
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
    )
  );

create policy "Users can upload own request documents"
  on storage.objects
  for insert
  with check (
    bucket_id = 'request-documents'
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
    )
  );

create policy "Users can update own request documents"
  on storage.objects
  for update
  using (
    bucket_id = 'request-documents'
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
    )
  )
  with check (
    bucket_id = 'request-documents'
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
    )
  );

create policy "Users can delete own request documents"
  on storage.objects
  for delete
  using (
    bucket_id = 'request-documents'
    and (
      owner = auth.uid()
      or owner_id = auth.uid()::text
      or (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[3] = auth.uid()::text
    )
  );
