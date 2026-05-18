-- Line admins could read assistance_requests + admin_notification rows but not audit_logs,
-- so Notifications.jsx failed after joining audit_logs (empty → no inbox items).

begin;

set search_path = public;

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
      and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
      and (
        r.user_id = auth.uid()
        or public.is_superadmin(auth.uid())
        or exists (
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
  );
$$;

comment on function public.admin_can_access_assistance_request(uuid) is
  'True when auth user is applicant, superadmin, or line admin scoped to the request service (catalog binding).';

grant execute on function public.admin_can_access_assistance_request(uuid) to authenticated, service_role;

create or replace function public.can_read_audit_log(
  p_request_table text,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_request_id is not null
    and public.admin_can_access_assistance_request(p_request_id);
$$;

comment on function public.can_read_audit_log(text, uuid) is
  'Applicants and line admins (catalog scope) may read audit_logs for assistance_requests.';

commit;
