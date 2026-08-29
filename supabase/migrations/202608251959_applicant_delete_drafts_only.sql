-- Applicants may delete only their own draft assistance_requests.
-- Submitted rows stay in Status for tracking; superadmins keep unrestricted delete.

begin;

set search_path = public;

drop policy if exists assistance_requests_owner_all on public.assistance_requests;
drop policy if exists assistance_requests_owner_select on public.assistance_requests;
drop policy if exists assistance_requests_owner_insert on public.assistance_requests;
drop policy if exists assistance_requests_owner_update on public.assistance_requests;
drop policy if exists assistance_requests_owner_delete_draft on public.assistance_requests;

create policy assistance_requests_owner_select
  on public.assistance_requests
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_superadmin(auth.uid())
  );

create policy assistance_requests_owner_insert
  on public.assistance_requests
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.is_superadmin(auth.uid())
  );

create policy assistance_requests_owner_update
  on public.assistance_requests
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_superadmin(auth.uid())
  )
  with check (
    auth.uid() = user_id
    or public.is_superadmin(auth.uid())
  );

create policy assistance_requests_owner_delete_draft
  on public.assistance_requests
  for delete
  to authenticated
  using (
    public.is_superadmin(auth.uid())
    or (
      auth.uid() = user_id
      and lower(btrim(coalesce(status, ''))) = 'draft'
    )
  );

commit;
