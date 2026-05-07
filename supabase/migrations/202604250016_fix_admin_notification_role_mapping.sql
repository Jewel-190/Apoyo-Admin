-- Fix admin notification routing to target the 3 admin roles directly.
-- Also reverts temporary smoke-test schema change.

alter table public.audit_logs
  drop column if exists notes;

create or replace function public.process_admin_notifications()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_inserted integer := 0;
begin
  with candidate_admins as (
    select
      a.user_id,
      lower(coalesce(a.role, '')) as role_key,
      lower(coalesce(a.service_type, '')) as service_key
    from public.admins a
    where lower(coalesce(a.role, '')) in ('medical_admin', 'financial_admin', 'burial_admin')
  ),
  inserted as (
    insert into public.admin_notification (audit_log_id, admin_user_id)
    select
      al.id,
      ca.user_id
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
    on conflict (audit_log_id, admin_user_id) do nothing
    returning 1
  )
  select count(*) into v_inserted
  from inserted;

  return v_inserted;
end;
$$;

revoke all on function public.process_admin_notifications() from public, anon, authenticated;
grant execute on function public.process_admin_notifications() to service_role;
