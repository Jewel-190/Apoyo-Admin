-- Align admin notifications with catalog-scoped admins (role + service_type + category_id)
-- and unified public.assistance_requests audit rows.

begin;

set search_path = public, private;

-- Resolve catalog line slug (medical | financial | burial | …) from legacy request_table
-- or from assistance_requests + service_key → category slug.
create or replace function private.request_line_slug(p_request_table text, p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_slug text;
begin
  if p_request_id is null then
    return null;
  end if;

  if lower(trim(coalesce(p_request_table, ''))) = 'assistance_requests' then
    select lower(trim(c.slug))
    into v_slug
    from public.assistance_requests r
    join public.assistance_services s
      on s.service_key = r.service_key
      and coalesce(s.active, true) is not false
    join public.assistance_categories c
      on c.id = s.category_id
      and coalesce(c.active, true) is not false
    where r.id = p_request_id
    limit 1;
    return v_slug;
  end if;

  return private.audit_log_service_type(p_request_table);
end;
$$;

revoke all on function private.request_line_slug(text, uuid) from public;
grant execute on function private.request_line_slug(text, uuid) to service_role;

-- Applicant user_id for legacy physical tables or unified assistance_requests.
create or replace function private.user_notification_request_owner(
  p_request_table text,
  p_request_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if p_request_id is null or coalesce(trim(p_request_table), '') = '' then
    return null;
  end if;

  if lower(trim(p_request_table)) = 'assistance_requests' then
    select r.user_id
    into v_uid
    from public.assistance_requests r
    where r.id = p_request_id
    limit 1;
    return v_uid;
  end if;

  begin
    execute format('select user_id from public.%I where id = $1 limit 1', p_request_table)
      into v_uid
      using p_request_id;
  exception
    when undefined_table or undefined_column then
      return null;
  end;

  return v_uid;
end;
$$;

revoke all on function private.user_notification_request_owner(text, uuid) from public;
grant execute on function private.user_notification_request_owner(text, uuid) to service_role;

-- Status text for filtering approved / complete rows out of admin notifications.
create or replace function private.admin_notification_request_status(
  p_request_table text,
  p_request_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(trim(p_request_table), '') = '' or p_request_id is null then
    return null;
  end if;

  if lower(trim(p_request_table)) = 'assistance_requests' then
    select r.status::text
    into v_status
    from public.assistance_requests r
    where r.id = p_request_id
    limit 1;
    return v_status;
  end if;

  begin
    execute format('select status::text from public.%I where id = $1 limit 1', p_request_table)
      into v_status
      using p_request_id;
  exception
    when undefined_table or undefined_column then
      return null;
  end;

  return v_status;
end;
$$;

revoke all on function private.admin_notification_request_status(text, uuid) from public;
grant execute on function private.admin_notification_request_status(text, uuid) to service_role;

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
  where private.user_notification_request_owner(an.request_table, an.request_id) is null
     or lower(coalesce(private.admin_notification_request_status(an.request_table, an.request_id), ''))
        in ('approved', 'complete', 'done');

  with candidate_admins as (
    select
      a.user_id,
      coalesce(
        case lower(trim(coalesce(a.role, '')))
          when 'medical_admin' then 'medical'
          when 'financial_admin' then 'financial'
          when 'burial_admin' then 'burial'
          else null
        end,
        nullif(lower(trim(coalesce(a.service_type, ''))), ''),
        (
          select lower(trim(c.slug))
          from public.assistance_categories c
          where c.id = a.category_id
          limit 1
        )
      ) as effective_line_slug
    from public.admins a
    where a.user_id is not null
      and lower(trim(coalesce(a.role, ''))) <> 'super_admin'
      and coalesce(
        case lower(trim(coalesce(a.role, '')))
          when 'medical_admin' then 'medical'
          when 'financial_admin' then 'financial'
          when 'burial_admin' then 'burial'
          else null
        end,
        nullif(lower(trim(coalesce(a.service_type, ''))), ''),
        (
          select lower(trim(c.slug))
          from public.assistance_categories c
          where c.id = a.category_id
          limit 1
        )
      ) is not null
  ),
  latest_changes as (
    select distinct on (ca.user_id, lower(al.request_table), al.request_id)
      ca.user_id as admin_user_id,
      al.request_table,
      al.request_id,
      al.id as audit_log_id,
      coalesce(al.changed_at, now()) as event_at
    from public.audit_logs al
    join candidate_admins ca
      on private.request_line_slug(al.request_table, al.request_id) = ca.effective_line_slug
    where al.request_id is not null
      and private.request_line_slug(al.request_table, al.request_id) is not null
      and private.user_notification_request_owner(al.request_table, al.request_id) is not null
      and private.is_user_initiated_audit_movement(
        al.request_table,
        al.request_id,
        al.changed_by,
        al.changed_by_role
      )
      and lower(coalesce(private.admin_notification_request_status(al.request_table, al.request_id), ''))
        not in ('approved', 'complete', 'done')
    order by
      ca.user_id,
      lower(al.request_table),
      al.request_id,
      coalesce(al.changed_at, now()) desc,
      al.id desc
  ),
  upserted as (
    insert into public.admin_notification (
      audit_log_id,
      admin_user_id,
      request_table,
      request_id,
      is_read,
      created_at,
      updated_at
    )
    select
      lc.audit_log_id,
      lc.admin_user_id,
      lc.request_table,
      lc.request_id,
      false,
      lc.event_at,
      lc.event_at
    from latest_changes lc
    on conflict (admin_user_id, request_table, request_id)
    do update
    set
      audit_log_id = excluded.audit_log_id,
      updated_at = excluded.updated_at,
      is_read = case
        when public.admin_notification.audit_log_id is distinct from excluded.audit_log_id
          then false
        else public.admin_notification.is_read
      end
    where public.admin_notification.audit_log_id is distinct from excluded.audit_log_id
    returning 1
  )
  select count(*) into v_upserted
  from upserted;

  return v_upserted;
end;
$$;

revoke all on function public.process_admin_notifications() from public, anon, authenticated;
grant execute on function public.process_admin_notifications() to service_role;

create or replace function public.get_unread_notification_count_for_admin(
  p_admin_user_id uuid default auth.uid()
)
returns integer
language sql
stable
security definer
set search_path = public, private
as $$
  select count(*)::int
  from public.admin_notification an
  join public.audit_logs al
    on al.id = an.audit_log_id
  where an.admin_user_id = p_admin_user_id
    and an.is_read = false
    and private.user_notification_request_owner(an.request_table, an.request_id) is not null
    and private.is_user_initiated_audit_movement(
      al.request_table,
      al.request_id,
      al.changed_by,
      al.changed_by_role
    )
    and lower(coalesce(private.admin_notification_request_status(an.request_table, an.request_id), ''))
      not in ('approved', 'complete', 'done')
    and (auth.role() = 'service_role' or auth.uid() = p_admin_user_id);
$$;

revoke all on function public.get_unread_notification_count_for_admin(uuid) from public;
grant execute on function public.get_unread_notification_count_for_admin(uuid) to authenticated, service_role;

select public.process_admin_notifications();

commit;
