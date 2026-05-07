-- Enforce one admin notification row per request per admin.
-- New changes on the same request update the existing row and mark it unread.

alter table public.admin_notification
  add column if not exists request_table text,
  add column if not exists request_id uuid;

update public.admin_notification an
set
  request_table = al.request_table,
  request_id = al.request_id
from public.audit_logs al
where an.audit_log_id = al.id
  and (
    an.request_table is distinct from al.request_table
    or an.request_id is distinct from al.request_id
  );

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

alter table public.admin_notification
  alter column request_table set not null,
  alter column request_id set not null;

alter table public.admin_notification
  drop constraint if exists admin_notification_audit_log_id_admin_user_id_key;

create unique index if not exists admin_notification_admin_request_unique_idx
  on public.admin_notification(admin_user_id, request_table, request_id);

create index if not exists admin_notification_request_lookup_idx
  on public.admin_notification(request_table, request_id);

create or replace function public.process_admin_notifications()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_upserted integer := 0;
begin
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

create or replace function public.mark_request_notifications_read_for_admin(
  p_admin_user_id uuid,
  p_request_table text,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rows integer := 0;
begin
  if auth.role() <> 'service_role' and auth.uid() <> p_admin_user_id then
    raise exception 'not authorized';
  end if;

  update public.admin_notification an
  set
    is_read = true,
    updated_at = now()
  where an.admin_user_id = p_admin_user_id
    and lower(an.request_table) = lower(p_request_table)
    and an.request_id = p_request_id
    and an.is_read = false;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.mark_request_notifications_read_for_admin(uuid, text, uuid) from public;
grant execute on function public.mark_request_notifications_read_for_admin(uuid, text, uuid) to authenticated, service_role;
