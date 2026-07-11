-- Drop assistance_categories.admin_role_key; line scope uses admins.service_type → categories.slug
-- (and optional category_id pin). Replaces all admin_role_key RLS / helper logic.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- Central catalog scope: admin ↔ category (no admin_role_key)
-- ---------------------------------------------------------------------------
create or replace function public.line_admin_matches_category(
  p_user_id uuid,
  p_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = p_category_id
    where a.user_id = p_user_id
      and lower(trim(coalesce(a.role, ''))) is distinct from 'super_admin'
      and (
        (a.category_id is not null and a.category_id = c.id)
        or (
          nullif(trim(lower(coalesce(a.service_type::text, ''))), '') is not null
          and lower(trim(c.slug::text)) = lower(trim(a.service_type::text))
        )
        or (
          nullif(trim(lower(coalesce(a.service_type::text, ''))), '') is null
          and nullif(trim(lower(coalesce(a.role::text, ''))), '') in (
            'medical_admin',
            'financial_admin',
            'burial_admin'
          )
          and lower(trim(c.slug::text)) =
            regexp_replace(lower(trim(a.role::text)), '_admin$', '')
        )
      )
  );
$$;

comment on function public.line_admin_matches_category(uuid, uuid) is
  'True when a line admin row is scoped to the catalog category via category_id, service_type slug FK, or role→slug mapping.';

grant execute on function public.line_admin_matches_category(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Request access (applicant, superadmin, or catalog-scoped line admin)
-- ---------------------------------------------------------------------------
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
    join public.assistance_services s on s.id = r.service_id
    join public.assistance_categories c on c.id = s.category_id
    where r.id = p_request_id
      and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
      and coalesce(s.active, true) = true
      and (
        r.user_id = auth.uid()
        or public.is_superadmin(auth.uid())
        or public.line_admin_matches_category(auth.uid(), c.id)
      )
  );
$$;

comment on function public.admin_can_access_assistance_request(uuid) is
  'Applicant, superadmin, or line admin with catalog scope (slug / category_id).';

grant execute on function public.admin_can_access_assistance_request(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Attachments (same scope as parent request)
-- ---------------------------------------------------------------------------
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
  select public.admin_can_access_assistance_request(p_request_uid);
$$;

comment on function public.can_access_request_attachment(text, uuid) is
  'RLS: same as admin_can_access_assistance_request for assistance_requests parent.';

-- ---------------------------------------------------------------------------
-- assistance_requests line-admin policies
-- ---------------------------------------------------------------------------
drop policy if exists assistance_requests_admin_select on public.assistance_requests;
drop policy if exists assistance_requests_admin_update on public.assistance_requests;

create policy assistance_requests_admin_select on public.assistance_requests
  for select
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      join public.assistance_services s on s.id = assistance_requests.service_id
      join public.assistance_categories c on c.id = s.category_id
      where a.user_id = auth.uid()
        and coalesce(s.active, true) = true
        and public.line_admin_matches_category(a.user_id, c.id)
    )
  );

create policy assistance_requests_admin_update on public.assistance_requests
  for update
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      join public.assistance_services s on s.id = assistance_requests.service_id
      join public.assistance_categories c on c.id = s.category_id
      where a.user_id = auth.uid()
        and coalesce(s.active, true) = true
        and public.line_admin_matches_category(a.user_id, c.id)
    )
  )
  with check (
    exists (
      select 1
      from public.admins a
      join public.assistance_services s on s.id = assistance_requests.service_id
      join public.assistance_categories c on c.id = s.category_id
      where a.user_id = auth.uid()
        and coalesce(s.active, true) = true
        and public.line_admin_matches_category(a.user_id, c.id)
    )
  );

-- ---------------------------------------------------------------------------
-- Notifications: resolve admin category without admin_role_key
-- ---------------------------------------------------------------------------
create or replace function private.admin_assistance_category_id(p_admin_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_cat uuid;
  v_slug text;
begin
  select lower(trim(coalesce(a.role, ''))),
         a.category_id,
         nullif(lower(trim(coalesce(a.service_type, ''))), '')
    into v_role, v_cat, v_slug
  from public.admins a
  where a.user_id = p_admin_user_id
  limit 1;

  if v_cat is not null then
    return v_cat;
  end if;

  if v_slug is not null then
    select c.id
      into v_cat
      from public.assistance_categories c
      where lower(trim(c.slug)) = v_slug
      limit 1;
    return v_cat;
  end if;

  if v_role in ('medical_admin', 'financial_admin', 'burial_admin') then
    select c.id
      into v_cat
      from public.assistance_categories c
      where lower(trim(c.slug)) = regexp_replace(v_role, '_admin$', '')
      limit 1;
    return v_cat;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drop column + index
-- ---------------------------------------------------------------------------
drop index if exists public.assistance_categories_admin_role_key_uidx;

alter table public.assistance_categories
  drop column if exists admin_role_key;

commit;
