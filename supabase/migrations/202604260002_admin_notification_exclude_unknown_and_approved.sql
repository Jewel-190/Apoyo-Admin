-- Exclude unknown applicants and approved requests from admin notifications.
-- Applies to all admin roles by filtering in processing and read/list RPC paths.

create or replace function private.admin_notification_request_status(
  p_request_table text,
  p_request_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_status text;
begin
  if coalesce(trim(p_request_table), '') = '' or p_request_id is null then
    return null;
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

-- One-time cleanup for existing rows that should no longer appear.
delete from public.admin_notification an
where private.user_notification_request_owner(an.request_table, an.request_id) is null
   or lower(coalesce(private.admin_notification_request_status(an.request_table, an.request_id), ''))
      in ('approved', 'complete', 'done');

create or replace function public.process_admin_notifications()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_upserted integer := 0;
begin
  -- Keep notification table free of rows that are no longer actionable.
  delete from public.admin_notification an
  where private.user_notification_request_owner(an.request_table, an.request_id) is null
     or lower(coalesce(private.admin_notification_request_status(an.request_table, an.request_id), ''))
        in ('approved', 'complete', 'done');

  with candidate_admins as (
    select
      a.user_id,
      lower(coalesce(a.role, '')) as role_key,
      lower(coalesce(a.service_type, '')) as service_key
    from public.admins a
    where lower(coalesce(a.role, '')) in ('medical_admin', 'financial_admin', 'burial_admin')
  ),
  latest_changes as (
    select distinct on (ca.user_id, lower(al.request_table), al.request_id)
      ca.user_id as admin_user_id,
      al.request_table,
      al.request_id,
      al.id as audit_log_id,
      coalesce(al.changed_at, now()) as changed_at
    from public.audit_logs al
    join candidate_admins ca
      on (
        private.audit_log_service_type(al.request_table) = case ca.role_key
          when 'medical_admin' then 'medical'
          when 'financial_admin' then 'financial'
          when 'burial_admin' then 'burial'
          else null
        end
      )
      or (
        private.audit_log_service_type(al.request_table) = ca.service_key
        and ca.service_key in ('medical', 'financial', 'burial')
      )
    where al.request_id is not null
      and private.audit_log_service_type(al.request_table) is not null
      and private.user_notification_request_owner(al.request_table, al.request_id) is not null
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
      now(),
      now()
    from latest_changes lc
    on conflict (admin_user_id, request_table, request_id)
    do update
    set
      audit_log_id = excluded.audit_log_id,
      updated_at = now(),
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

create or replace function public.get_latest_notifications_for_admin(
  p_admin_user_id uuid default auth.uid()
)
returns table (
  id uuid,
  audit_log_id uuid,
  is_read boolean,
  created_at timestamptz,
  updated_at timestamptz,
  request_table text,
  request_id uuid,
  action text,
  changed_by uuid,
  changed_at timestamptz,
  old_status text,
  new_status text,
  changed_by_role text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    an.id,
    an.audit_log_id,
    an.is_read,
    an.created_at,
    an.updated_at,
    al.request_table,
    al.request_id,
    al.action,
    al.changed_by,
    al.changed_at,
    al.old_status,
    al.new_status,
    al.changed_by_role
  from public.admin_notification an
  join public.audit_logs al
    on al.id = an.audit_log_id
  where an.admin_user_id = p_admin_user_id
    and private.user_notification_request_owner(an.request_table, an.request_id) is not null
    and lower(coalesce(private.admin_notification_request_status(an.request_table, an.request_id), ''))
      not in ('approved', 'complete', 'done')
    and (auth.role() = 'service_role' or auth.uid() = p_admin_user_id)
  order by an.updated_at desc, an.created_at desc;
$$;

revoke all on function public.get_latest_notifications_for_admin(uuid) from public;
grant execute on function public.get_latest_notifications_for_admin(uuid) to authenticated, service_role;
