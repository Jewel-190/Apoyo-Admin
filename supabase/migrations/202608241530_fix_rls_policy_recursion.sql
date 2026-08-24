-- Break RLS infinite recursion between catalog tables and assistance_requests.
--
-- Root cause (202608241200_assistance_catalog_retention.sql):
--   assistance_requests policies SELECT assistance_services
--   assistance_services / categories / requirements history policies SELECT
--     assistance_requests (and services)
-- Postgres evaluates every permissive SELECT policy, so authenticated catalog
-- and caseload reads recurse.
--
-- Fix: policies may only call SECURITY DEFINER helpers. Those helpers read
-- related tables as the function owner (bypasses RLS) and never re-enter
-- policy expressions on the calling table.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, no policy-to-policy table scans)
-- ---------------------------------------------------------------------------

create or replace function public.rls_admin_can_access_request_row(
  p_status text,
  p_category_id uuid,
  p_service_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(trim(lower(coalesce(p_status, ''))), '') is distinct from 'draft'
    and (
      public.is_superadmin(auth.uid())
      or public.line_admin_matches_category(
        auth.uid(),
        coalesce(
          p_category_id,
          (
            select s.category_id
            from public.assistance_services s
            where s.id = p_service_id
          )
        )
      )
    );
$$;

comment on function public.rls_admin_can_access_request_row(text, uuid, uuid) is
  'RLS helper: superadmin or line admin of the request snapshot/live category. Bypasses catalog RLS.';

create or replace function public.rls_can_select_assistance_service(
  p_service_id uuid,
  p_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin(auth.uid())
    or public.line_admin_matches_category(auth.uid(), p_category_id)
    or exists (
      select 1
      from public.assistance_requests r
      where r.service_id = p_service_id
        and r.user_id = auth.uid()
    );
$$;

comment on function public.rls_can_select_assistance_service(uuid, uuid) is
  'RLS helper: archived/inactive services stay readable for superadmin, line admin, or the applicant who already has a request.';

create or replace function public.rls_can_select_assistance_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin(auth.uid())
    or public.line_admin_matches_category(auth.uid(), p_category_id)
    or exists (
      select 1
      from public.assistance_requests r
      where r.user_id = auth.uid()
        and (
          r.category_id = p_category_id
          or exists (
            select 1
            from public.assistance_services s
            where s.id = r.service_id
              and s.category_id = p_category_id
          )
        )
    );
$$;

comment on function public.rls_can_select_assistance_category(uuid) is
  'RLS helper: archived/inactive categories stay readable for superadmin, line admin, or the applicant with history on that line.';

create or replace function public.rls_can_select_assistance_requirement(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.assistance_services s
      where s.id = p_service_id
        and public.line_admin_matches_category(auth.uid(), s.category_id)
    )
    or exists (
      select 1
      from public.assistance_requests r
      where r.service_id = p_service_id
        and r.user_id = auth.uid()
    );
$$;

create or replace function public.rls_service_is_active(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_services s
    where s.id = p_service_id
      and s.active is true
  );
$$;

create or replace function public.rls_requirement_is_on_active_service(p_requirement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requirements r
    join public.assistance_services s on s.id = r.service_id
    where r.id = p_requirement_id
      and s.active is true
  );
$$;

create or replace function public.admin_can_access_assistance_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_id
      and (
        r.user_id = auth.uid()
        or public.rls_admin_can_access_request_row(
          r.status::text,
          r.category_id,
          r.service_id
        )
      )
  );
$$;

comment on function public.admin_can_access_assistance_request(uuid) is
  'Applicant, superadmin, or line admin of the request snapshot line. Catalog active flags are ignored.';

create or replace function public.admin_can_access_user_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.user_id = p_user_id
      and public.rls_admin_can_access_request_row(
        r.status::text,
        r.category_id,
        r.service_id
      )
  );
$$;

comment on function public.admin_can_access_user_profile(uuid) is
  'True when the caller is a superadmin or a line admin with a non-draft historical request from this applicant.';

create or replace function public.can_access_request_attachment(p_request_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_uid
      and (
        r.user_id = auth.uid()
        or public.rls_admin_can_access_request_row(
          r.status::text,
          r.category_id,
          r.service_id
        )
      )
  );
$$;

create or replace function public.can_access_request_attachment(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_request_attachment(p_request_uid);
$$;

revoke all on function public.rls_admin_can_access_request_row(text, uuid, uuid) from public, anon;
revoke all on function public.rls_can_select_assistance_service(uuid, uuid) from public, anon;
revoke all on function public.rls_can_select_assistance_category(uuid) from public, anon;
revoke all on function public.rls_can_select_assistance_requirement(uuid) from public, anon;
revoke all on function public.rls_service_is_active(uuid) from public, anon;
revoke all on function public.rls_requirement_is_on_active_service(uuid) from public, anon;
revoke all on function public.admin_can_access_assistance_request(uuid) from public, anon;
revoke all on function public.admin_can_access_user_profile(uuid) from public, anon;
revoke all on function public.can_access_request_attachment(uuid) from public, anon;
revoke all on function public.can_access_request_attachment(text, uuid) from public, anon;

grant execute on function public.rls_admin_can_access_request_row(text, uuid, uuid) to authenticated, service_role;
grant execute on function public.rls_can_select_assistance_service(uuid, uuid) to authenticated, service_role;
grant execute on function public.rls_can_select_assistance_category(uuid) to authenticated, service_role;
grant execute on function public.rls_can_select_assistance_requirement(uuid) to authenticated, service_role;
grant execute on function public.rls_service_is_active(uuid) to anon, authenticated, service_role;
grant execute on function public.rls_requirement_is_on_active_service(uuid) to anon, authenticated, service_role;
grant execute on function public.admin_can_access_assistance_request(uuid) to authenticated, service_role;
grant execute on function public.admin_can_access_user_profile(uuid) to authenticated, service_role;
grant execute on function public.can_access_request_attachment(uuid) to authenticated, service_role;
grant execute on function public.can_access_request_attachment(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies: no cross-table SELECTs in USING / WITH CHECK
-- ---------------------------------------------------------------------------

drop policy if exists assistance_requests_admin_select on public.assistance_requests;
drop policy if exists assistance_requests_admin_update on public.assistance_requests;

create policy assistance_requests_admin_select on public.assistance_requests
  for select
  to authenticated
  using (
    public.rls_admin_can_access_request_row(
      status::text,
      category_id,
      service_id
    )
  );

create policy assistance_requests_admin_update on public.assistance_requests
  for update
  to authenticated
  using (
    public.rls_admin_can_access_request_row(
      status::text,
      category_id,
      service_id
    )
  )
  with check (
    public.rls_admin_can_access_request_row(
      status::text,
      category_id,
      service_id
    )
  );

drop policy if exists assistance_services_select_history on public.assistance_services;
create policy assistance_services_select_history
  on public.assistance_services
  for select
  to authenticated
  using (
    public.rls_can_select_assistance_service(id, category_id)
  );

drop policy if exists assistance_categories_select_history on public.assistance_categories;
create policy assistance_categories_select_history
  on public.assistance_categories
  for select
  to authenticated
  using (
    public.rls_can_select_assistance_category(id)
  );

drop policy if exists assistance_requirements_select_history on public.assistance_requirements;
create policy assistance_requirements_select_history
  on public.assistance_requirements
  for select
  to authenticated
  using (
    public.rls_can_select_assistance_requirement(service_id)
  );

drop policy if exists assistance_requirements_public_read_for_active_services
  on public.assistance_requirements;
create policy assistance_requirements_public_read_for_active_services
  on public.assistance_requirements
  for select
  to anon, authenticated
  using (public.rls_service_is_active(service_id));

drop policy if exists assistance_requirement_tips_public_read_for_active_services
  on public.assistance_requirement_tips;
create policy assistance_requirement_tips_public_read_for_active_services
  on public.assistance_requirement_tips
  for select
  to anon, authenticated
  using (public.rls_requirement_is_on_active_service(requirement_id));

commit;
