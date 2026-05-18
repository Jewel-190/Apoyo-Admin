-- Align RLS role branch with app: admins.role may be short (financial) while
-- assistance_categories.admin_role_key is financial_admin (same base key).

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
        and exists (
          select 1
          from public.assistance_services s
          join public.assistance_categories c on c.id = s.category_id
          where s.service_key = assistance_requests.service_key
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
                  or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') = regexp_replace(lower(trim(a.role::text)), '_admin$', '')
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
        and exists (
          select 1
          from public.assistance_services s
          join public.assistance_categories c on c.id = s.category_id
          where s.service_key = assistance_requests.service_key
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
                  or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') = regexp_replace(lower(trim(a.role::text)), '_admin$', '')
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
  with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and exists (
          select 1
          from public.assistance_services s
          join public.assistance_categories c on c.id = s.category_id
          where s.service_key = assistance_requests.service_key
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
                  or regexp_replace(lower(trim(c.admin_role_key::text)), '_admin$', '') = regexp_replace(lower(trim(a.role::text)), '_admin$', '')
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
  );

commit;
