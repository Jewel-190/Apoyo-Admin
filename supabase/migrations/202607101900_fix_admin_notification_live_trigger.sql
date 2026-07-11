-- Fix live admin notification enqueue to match the current admin_notification
-- schema (assistance_request_id + category-scoped admins). The previous trigger
-- still targeted dropped request_table/request_id columns and failed silently.

begin;

set search_path = public, private;

create or replace function private.enqueue_admin_notification_for_audit(
  p_audit_log_id uuid,
  p_request_id uuid,
  p_changed_by uuid,
  p_changed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_category_id uuid;
  v_status text;
  v_event_at timestamptz;
begin
  if p_audit_log_id is null or p_request_id is null then
    return;
  end if;

  if not private.is_user_initiated_assistance_audit(p_request_id, p_changed_by) then
    return;
  end if;

  select lower(trim(coalesce(r.status::text, '')))
    into v_status
  from public.assistance_requests r
  where r.id = p_request_id
  limit 1;

  if v_status is null or v_status in ('approved', 'complete', 'done', 'draft') then
    return;
  end if;

  v_category_id := private.assistance_category_id_for_request(p_request_id);
  if v_category_id is null then
    return;
  end if;

  v_event_at := coalesce(p_changed_at, now());

  insert into public.admin_notification (
    admin_user_id,
    audit_log_id,
    assistance_request_id,
    is_read,
    created_at,
    updated_at
  )
  select
    a.user_id,
    p_audit_log_id,
    p_request_id,
    false,
    v_event_at,
    v_event_at
  from public.admins a
  where a.user_id is not null
    and a.is_super_admin = false
    and a.category_id is not null
    and a.category_id = v_category_id
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
  where public.admin_notification.audit_log_id is distinct from excluded.audit_log_id;
end;
$$;

revoke all on function private.enqueue_admin_notification_for_audit(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- Drop the broken 6-arg overload from the previous migration.
drop function if exists private.enqueue_admin_notification_for_audit(uuid, text, uuid, uuid, text, timestamptz);

create or replace function private.trg_audit_logs_enqueue_admin_notification()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  begin
    perform private.enqueue_admin_notification_for_audit(
      new.id,
      new.request_id,
      new.changed_by,
      new.changed_at
    );
  exception
    when others then
      raise warning 'admin notification enqueue failed for audit_log %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_audit_logs_admin_notification on public.audit_logs;

create trigger trg_audit_logs_admin_notification
after insert on public.audit_logs
for each row
execute function private.trg_audit_logs_enqueue_admin_notification();

comment on function private.enqueue_admin_notification_for_audit(uuid, uuid, uuid, timestamptz) is
  'Live enqueue of admin_notification rows for a single applicant audit event.';

commit;
