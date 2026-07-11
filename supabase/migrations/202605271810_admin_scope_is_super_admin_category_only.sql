-- Final admin scope model:
-- - super scope: admins.is_super_admin = true
-- - line scope:  admins.category_id (assistance_categories.id)
-- Legacy line identifiers (admins.role / admins.service_type) are removed.

begin;

set search_path = public, private;

alter table public.admins
  add column if not exists is_super_admin boolean not null default false;

update public.admins
set is_super_admin = true
where lower(trim(coalesce(role, ''))) = 'super_admin';

update public.admins a
set category_id = c.id
from public.assistance_categories c
where a.category_id is null
  and a.service_type is not null
  and lower(trim(a.service_type)) = lower(trim(c.slug));

update public.admins a
set category_id = c.id
from public.assistance_categories c
where a.category_id is null
  and a.is_super_admin = false
  and lower(trim(coalesce(a.role, ''))) in ('medical_admin', 'financial_admin', 'burial_admin')
  and lower(trim(c.slug)) = regexp_replace(lower(trim(a.role)), '_admin$', '');

update public.admins
set category_id = null
where is_super_admin = true;

alter table public.admins
  drop constraint if exists admins_superadmin_scope_chk;

alter table public.admins
  add constraint admins_superadmin_scope_chk
  check ((not is_super_admin) or category_id is null);

create or replace function public.is_superadmin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = uid
      and a.is_super_admin = true
  );
$$;

grant execute on function public.is_superadmin(uuid) to authenticated, service_role;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.is_super_admin then 'super_admin'
    when c.slug is not null then lower(trim(c.slug)) || '_admin'
    else null
  end
  from public.admins a
  left join public.assistance_categories c on c.id = a.category_id
  where a.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and (a.is_super_admin = true or a.category_id is not null)
  );
$$;

create or replace function public.is_medical_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'medical'
  );
$$;

create or replace function public.is_financial_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'financial'
  );
$$;

create or replace function public.is_burial_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'burial'
  );
$$;

create or replace function public.normalize_admin_role(p_role text, p_service_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_role, ''))) = 'super_admin' then 'super_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'medical' then 'medical_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'financial' then 'financial_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'burial' then 'burial_admin'
    else null
  end;
$$;

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
    where a.user_id = p_user_id
      and a.is_super_admin = false
      and a.category_id = p_category_id
  );
$$;

comment on function public.line_admin_matches_category(uuid, uuid) is
  'True when admin is a non-super line admin pinned to the given assistance category.';

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

create or replace function public.can_access_request_attachment(p_request_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_can_access_assistance_request(p_request_uid);
$$;

create or replace function private.admin_assistance_category_id(p_admin_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.is_super_admin then null
    else a.category_id
  end
  from public.admins a
  where a.user_id = p_admin_user_id
  limit 1;
$$;

revoke all on function private.admin_assistance_category_id(uuid) from public;
grant execute on function private.admin_assistance_category_id(uuid) to service_role;

create or replace function public.process_admin_notifications()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_upserted integer := 0;
begin
  delete from public.admin_notification an
  using public.audit_logs al
  join public.assistance_requests r
    on r.id = al.request_id
  where an.audit_log_id = al.id
    and lower(trim(coalesce(r.status::text, ''))) in ('approved', 'complete', 'done');

  delete from public.admin_notification an
  using public.audit_logs al
  where an.audit_log_id = al.id
    and private.assistance_category_id_for_request(al.request_id)
        is distinct from private.admin_assistance_category_id(an.admin_user_id);

  with latest_audits as (
    select distinct on (al.request_id)
      al.request_id as assistance_request_id,
      al.id as audit_log_id,
      coalesce(al.changed_at, now()) as event_at
    from public.audit_logs al
    where al.request_id is not null
      and exists (
        select 1
        from public.assistance_requests r0
        where r0.id = al.request_id
      )
      and private.is_user_initiated_assistance_audit(al.request_id, al.changed_by)
      and exists (
        select 1
        from public.assistance_requests r2
        where r2.id = al.request_id
          and lower(trim(coalesce(r2.status::text, '')))
            not in ('approved', 'complete', 'done', 'draft')
      )
    order by
      al.request_id,
      coalesce(al.changed_at, now()) desc,
      al.id desc
  ),
  targets as (
    select
      a.user_id as admin_user_id,
      la.audit_log_id,
      la.assistance_request_id,
      la.event_at
    from latest_audits la
    join public.admins a
      on a.user_id is not null
      and a.is_super_admin = false
      and a.category_id is not null
    where private.assistance_category_id_for_request(la.assistance_request_id) = a.category_id
      and private.assistance_category_id_for_request(la.assistance_request_id) is not null
  ),
  upserted as (
    insert into public.admin_notification (
      admin_user_id,
      audit_log_id,
      assistance_request_id,
      is_read,
      created_at,
      updated_at
    )
    select
      t.admin_user_id,
      t.audit_log_id,
      t.assistance_request_id,
      false,
      t.event_at,
      t.event_at
    from targets t
    on conflict (admin_user_id, assistance_request_id) do update set
      audit_log_id = excluded.audit_log_id,
      updated_at = case
        when public.admin_notification.audit_log_id is distinct from excluded.audit_log_id
          then excluded.updated_at
        else public.admin_notification.updated_at
      end,
      is_read = case
        when public.admin_notification.audit_log_id is distinct from excluded.audit_log_id
          then false
        else public.admin_notification.is_read
      end
    returning 1
  )
  select coalesce((select count(*)::int from upserted), 0)
  into v_upserted;

  return v_upserted;
end;
$$;

revoke all on function public.process_admin_notifications() from public, anon, authenticated;
grant execute on function public.process_admin_notifications() to service_role;

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

drop policy if exists registered_voters_superadmin_all on public.registered_voters;
create policy registered_voters_superadmin_all on public.registered_voters
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and a.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and a.is_super_admin = true
    )
  );

alter table public.admins
  drop constraint if exists admins_service_type_slug_fkey;

alter table public.admins
  drop column if exists service_type;

alter table public.admins
  drop column if exists role;

comment on column public.admins.is_super_admin is
  'Admin privilege flag. true = superadmin access, false = line-admin access constrained by category_id.';

comment on column public.admins.category_id is
  'Line-admin scope FK to assistance_categories.id. Null for super admins.';

commit;
