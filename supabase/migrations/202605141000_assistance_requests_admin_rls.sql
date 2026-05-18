-- Allow line admins (medical / financial / burial) to read and update non-draft
-- assistance_requests in their service scope. Owner + superadmin rules stay on
-- the existing assistance_requests_owner_all policy (OR-combined with these).

begin;

set search_path = public;

drop policy if exists assistance_requests_admin_select on public.assistance_requests;
create policy assistance_requests_admin_select on public.assistance_requests
  for select
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and (
          (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'medical_admin'
              or lower(coalesce(a.service_type, '')) = 'medical'
            )
            and assistance_requests.service_key in ('hospital', 'treatment', 'operations')
          )
          or (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'financial_admin'
              or lower(coalesce(a.service_type, '')) = 'financial'
            )
            and assistance_requests.service_key in ('emergency-finance', 'burial-money')
          )
          or (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'burial_admin'
              or lower(coalesce(a.service_type, '')) = 'burial'
            )
            and assistance_requests.service_key in ('burial-site', 'cremation', 'columbarium')
          )
        )
    )
  );

drop policy if exists assistance_requests_admin_update on public.assistance_requests;
create policy assistance_requests_admin_update on public.assistance_requests
  for update
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and (
          (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'medical_admin'
              or lower(coalesce(a.service_type, '')) = 'medical'
            )
            and assistance_requests.service_key in ('hospital', 'treatment', 'operations')
          )
          or (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'financial_admin'
              or lower(coalesce(a.service_type, '')) = 'financial'
            )
            and assistance_requests.service_key in ('emergency-finance', 'burial-money')
          )
          or (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'burial_admin'
              or lower(coalesce(a.service_type, '')) = 'burial'
            )
            and assistance_requests.service_key in ('burial-site', 'cremation', 'columbarium')
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and (
          (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'medical_admin'
              or lower(coalesce(a.service_type, '')) = 'medical'
            )
            and assistance_requests.service_key in ('hospital', 'treatment', 'operations')
          )
          or (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'financial_admin'
              or lower(coalesce(a.service_type, '')) = 'financial'
            )
            and assistance_requests.service_key in ('emergency-finance', 'burial-money')
          )
          or (
            (
              lower(coalesce(nullif(trim(a.role), ''), '')) = 'burial_admin'
              or lower(coalesce(a.service_type, '')) = 'burial'
            )
            and assistance_requests.service_key in ('burial-site', 'cremation', 'columbarium')
          )
        )
    )
  );

commit;
