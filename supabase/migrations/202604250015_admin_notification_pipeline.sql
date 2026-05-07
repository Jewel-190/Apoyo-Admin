-- Admin notifications pipeline based on audit_logs, mirroring user_notification minimal shape.

drop table if exists public.admin_notification cascade;

create table if not exists public.admin_notification (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid not null references public.audit_logs(id) on delete cascade,
  admin_user_id uuid not null references public.admins(user_id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_notification_audit_log_id_admin_user_id_key unique (audit_log_id, admin_user_id)
);

create index if not exists admin_notification_admin_user_id_idx
  on public.admin_notification(admin_user_id);

create index if not exists admin_notification_is_read_idx
  on public.admin_notification(is_read);

create index if not exists admin_notification_created_at_idx
  on public.admin_notification(created_at desc);

create or replace function public.update_admin_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_admin_notification_updated_at on public.admin_notification;

create trigger trg_admin_notification_updated_at
before update on public.admin_notification
for each row
execute function public.update_admin_notification_updated_at();

create or replace function private.audit_log_service_type(p_request_table text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_request_table, ''))
    when 'hospitalization_requests' then 'medical'
    when 'treatment_requests' then 'medical'
    when 'medical_requests' then 'medical'
    when 'financial_requests' then 'financial'
    when 'monetary_requests' then 'financial'
    when 'financial_req' then 'financial'
    when 'financial_reqquests' then 'financial'
    when 'burial_requests' then 'burial'
    when 'cremation_requests' then 'burial'
    when 'columbarium_requests' then 'burial'
    else null
  end;
$$;

create or replace function public.process_admin_notifications()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_inserted integer := 0;
begin
  with inserted as (
    insert into public.admin_notification (audit_log_id, admin_user_id)
    select
      al.id,
      a.user_id
    from public.audit_logs al
    join public.admins a
      on lower(coalesce(a.service_type, '')) = private.audit_log_service_type(al.request_table)
    where al.request_id is not null
      and private.audit_log_service_type(al.request_table) is not null
      and lower(coalesce(a.role, '')) in ('medical_admin', 'financial_admin', 'burial_admin')
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
    and (auth.role() = 'service_role' or auth.uid() = p_admin_user_id)
  order by an.created_at desc;
$$;

revoke all on function public.get_latest_notifications_for_admin(uuid) from public;
grant execute on function public.get_latest_notifications_for_admin(uuid) to authenticated, service_role;

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
  where an.admin_user_id = p_admin_user_id
    and an.is_read = false
    and (auth.role() = 'service_role' or auth.uid() = p_admin_user_id);
$$;

revoke all on function public.get_unread_notification_count_for_admin(uuid) from public;
grant execute on function public.get_unread_notification_count_for_admin(uuid) to authenticated, service_role;

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
  from public.audit_logs al
  where an.audit_log_id = al.id
    and an.admin_user_id = p_admin_user_id
    and lower(al.request_table) = lower(p_request_table)
    and al.request_id = p_request_id
    and an.is_read = false;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.mark_request_notifications_read_for_admin(uuid, text, uuid) from public;
grant execute on function public.mark_request_notifications_read_for_admin(uuid, text, uuid) to authenticated, service_role;

alter table public.admin_notification enable row level security;

drop policy if exists "Admins can read own notifications" on public.admin_notification;
create policy "Admins can read own notifications"
  on public.admin_notification
  for select
  to authenticated
  using (auth.uid() = admin_user_id);

drop policy if exists "Admins can update own notifications" on public.admin_notification;
create policy "Admins can update own notifications"
  on public.admin_notification
  for update
  to authenticated
  using (auth.uid() = admin_user_id)
  with check (auth.uid() = admin_user_id);

drop policy if exists "No direct insert from client" on public.admin_notification;
create policy "No direct insert from client"
  on public.admin_notification
  for insert
  to authenticated
  with check (false);

drop policy if exists "No direct delete from client" on public.admin_notification;
create policy "No direct delete from client"
  on public.admin_notification
  for delete
  to authenticated
  using (false);
