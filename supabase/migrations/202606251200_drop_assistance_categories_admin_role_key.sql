-- Drop assistance_categories.admin_role_key (CMS no longer stores a separate admin role token).
-- Admin line access uses category slug + admins.role / admins.service_type / admins.category_id.

begin;

set search_path = public;

alter table public.assistance_categories
  drop column if exists admin_role_key;

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
  'True when an admins row may access requests in the given assistance_categories row (by category_id, service_type slug, or *_admin role vs category slug).';

drop policy if exists assistance_requests_admin_select on public.assistance_requests;

drop policy if exists assistance_requests_admin_update on public.assistance_requests;

create policy assistance_requests_admin_select on public.assistance_requests
  for select
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.assistance_services s
      where s.id = assistance_requests.service_id
        and coalesce(s.active, true) = true
        and public.line_admin_matches_category(auth.uid(), s.category_id)
    )
  );

create policy assistance_requests_admin_update on public.assistance_requests
  for update
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.assistance_services s
      where s.id = assistance_requests.service_id
        and coalesce(s.active, true) = true
        and public.line_admin_matches_category(auth.uid(), s.category_id)
    )
  )
  with check (
    exists (
      select 1
      from public.assistance_services s
      where s.id = assistance_requests.service_id
        and coalesce(s.active, true) = true
        and public.line_admin_matches_category(auth.uid(), s.category_id)
    )
  );

commit;
