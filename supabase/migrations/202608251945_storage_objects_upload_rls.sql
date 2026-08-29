-- storage.objects has RLS enabled, but this local stack never received bucket
-- policies (the public-schema dump does not include storage). Authenticated
-- uploads then fail with: new row violates row-level security policy.
--
-- Object keys for applicant files: {auth.uid}/{request_id}/{filename}
-- Older keys sometimes prefixed the bucket name as the first folder.

begin;

create or replace function public.storage_object_first_folder_is_caller(object_name text)
returns boolean
language sql
stable
as $$
  select
    auth.uid() is not null
    and btrim(coalesce(object_name, '')) <> ''
    and (
      split_part(object_name, '/', 1) = auth.uid()::text
      or (
        split_part(object_name, '/', 1) in (
          'request-documents',
          'avatars',
          'hospitalization-documents',
          'treatment-documents',
          'medical-documents',
          'financial-documents',
          'monetary-documents',
          'burial-documents',
          'cremation-documents',
          'columbarium-documents'
        )
        and split_part(object_name, '/', 2) = auth.uid()::text
      )
    );
$$;

comment on function public.storage_object_first_folder_is_caller(text) is
  'Storage RLS helper: object key is owned by auth.uid() (optional legacy bucket prefix).';

revoke all on function public.storage_object_first_folder_is_caller(text) from public, anon;
grant execute on function public.storage_object_first_folder_is_caller(text) to authenticated, service_role;

drop policy if exists "Users can upload own request documents" on storage.objects;
drop policy if exists "Users can read own request documents" on storage.objects;
drop policy if exists "Users can update own request documents" on storage.objects;
drop policy if exists "Users can delete own request documents" on storage.objects;
drop policy if exists "Users can upload own avatars" on storage.objects;
drop policy if exists "Users can read own avatars" on storage.objects;
drop policy if exists "Users can update own avatars" on storage.objects;
drop policy if exists "Users can delete own avatars" on storage.objects;
drop policy if exists "Admins can read request documents" on storage.objects;
drop policy if exists "Superadmins can write web-content" on storage.objects;
drop policy if exists "Superadmins can update web-content" on storage.objects;
drop policy if exists "Superadmins can delete web-content" on storage.objects;

create policy "Users can upload own request documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-documents'
  and public.storage_object_first_folder_is_caller(name)
);

create policy "Users can read own request documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-documents'
  and (
    public.storage_object_first_folder_is_caller(name)
    or public.is_any_admin()
  )
);

create policy "Users can update own request documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'request-documents'
  and public.storage_object_first_folder_is_caller(name)
)
with check (
  bucket_id = 'request-documents'
  and public.storage_object_first_folder_is_caller(name)
);

create policy "Users can delete own request documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-documents'
  and public.storage_object_first_folder_is_caller(name)
);

create policy "Users can upload own avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and public.storage_object_first_folder_is_caller(name)
);

create policy "Users can read own avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.storage_object_first_folder_is_caller(name)
    or public.is_any_admin()
  )
);

create policy "Users can update own avatars"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and public.storage_object_first_folder_is_caller(name)
)
with check (
  bucket_id = 'avatars'
  and public.storage_object_first_folder_is_caller(name)
);

create policy "Users can delete own avatars"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and public.storage_object_first_folder_is_caller(name)
);

create policy "Superadmins can write web-content"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'web-content'
  and public.is_superadmin(auth.uid())
);

create policy "Superadmins can update web-content"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'web-content'
  and public.is_superadmin(auth.uid())
)
with check (
  bucket_id = 'web-content'
  and public.is_superadmin(auth.uid())
);

create policy "Superadmins can delete web-content"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'web-content'
  and public.is_superadmin(auth.uid())
);

commit;
