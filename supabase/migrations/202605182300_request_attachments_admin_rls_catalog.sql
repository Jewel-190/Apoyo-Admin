-- Line admins could read assistance_requests but not request_attachments (medical-only gate).
-- Align attachment access with assistance_requests_admin_* catalog scope.

begin;

set search_path = public;

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
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_uid
      and (
        r.user_id = auth.uid()
        or public.is_superadmin(auth.uid())
        or (
          nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
          and exists (
            select 1
            from public.admins a
            where a.user_id = auth.uid()
              and exists (
                select 1
                from public.assistance_services s
                join public.assistance_categories c on c.id = s.category_id
                where s.id = r.service_id
                  and coalesce(s.active, true) = true
                  and (
                    (a.category_id is not null and c.id = a.category_id)
                    or (
                      a.category_id is null
                      and nullif(trim(lower(coalesce(a.role, ''))), '') is not null
                      and nullif(trim(lower(coalesce(c.admin_role_key::text, ''))), '') is not null
                      and (
                        lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text))
                        or lower(trim(c.admin_role_key::text)) = lower(trim(a.role::text)) || '_admin'
                        or lower(trim(a.role::text)) = lower(trim(c.admin_role_key::text)) || '_admin'
                        or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') =
                           regexp_replace(lower(trim(a.role::text)), '_admin$', '')
                      )
                    )
                    or (
                      a.category_id is null
                      and (
                        nullif(trim(lower(coalesce(a.role, ''))), '') is null
                        or trim(coalesce(a.role, '')) = ''
                      )
                      and nullif(trim(lower(coalesce(a.service_type::text, ''))), '') is not null
                      and lower(trim(c.slug::text)) = lower(trim(a.service_type::text))
                    )
                  )
              )
          )
        )
      )
  );
$$;

comment on function public.can_access_request_attachment(text, uuid) is
  'RLS: applicant, superadmin, or line admin with catalog scope on parent assistance_requests row.';

commit;
