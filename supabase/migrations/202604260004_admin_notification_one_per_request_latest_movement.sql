-- Restore one notification per request per admin.
-- Notification row tracks latest movement via audit_log_id update.

drop index if exists public.admin_notification_admin_audit_unique_idx;

-- Keep only notifications that should remain visible.
delete from public.admin_notification an
where private.user_notification_request_owner(an.request_table, an.request_id) is null
   or lower(coalesce(private.admin_notification_request_status(an.request_table, an.request_id), ''))
      in ('approved', 'complete', 'done');

-- Collapse existing per-movement rows to latest row per admin/request.
with ranked as (
  select
    an.id,
    row_number() over (
      partition by an.admin_user_id, lower(coalesce(an.request_table, '')), an.request_id
      order by
        coalesce(al.changed_at, an.updated_at, an.created_at) desc,
        an.updated_at desc,
        an.created_at desc,
        an.id desc
    ) as rn
  from public.admin_notification an
  left join public.audit_logs al
    on al.id = an.audit_log_id
)
delete from public.admin_notification an
using ranked r
where an.id = r.id
  and r.rn > 1;

create unique index if not exists admin_notification_admin_request_unique_idx
  on public.admin_notification(admin_user_id, request_table, request_id);

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
      coalesce(al.changed_at, now()) as event_at
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
  order by coalesce(al.changed_at, an.updated_at, an.created_at) desc, an.created_at desc;
$$;

revoke all on function public.get_latest_notifications_for_admin(uuid) from public;
grant execute on function public.get_latest_notifications_for_admin(uuid) to authenticated, service_role;

-- Recompute after restoring one-per-request behavior.
select public.process_admin_notifications();
