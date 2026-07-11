-- Make admin notifications live: enqueue an admin_notification row the moment a
-- qualifying audit_logs row is inserted, instead of waiting for the periodic
-- edge-function sync. This lets Supabase Realtime deliver the INSERT to the
-- correct admin immediately.

begin;

set search_path = public, private;

-- Scoped enqueue for a single audit_logs row. Mirrors the predicates used by
-- public.process_admin_notifications() but only for the one request that just
-- changed, so it is cheap enough to run inside the audit insert transaction.
create or replace function private.enqueue_admin_notification_for_audit(
  p_audit_log_id uuid,
  p_request_table text,
  p_request_id uuid,
  p_changed_by uuid,
  p_changed_by_role text,
  p_changed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_slug text;
begin
  if p_request_id is null then
    return;
  end if;

  v_slug := private.request_line_slug(p_request_table, p_request_id);
  if v_slug is null then
    return;
  end if;

  if private.user_notification_request_owner(p_request_table, p_request_id) is null then
    return;
  end if;

  if not private.is_user_initiated_audit_movement(
    p_request_table,
    p_request_id,
    p_changed_by,
    p_changed_by_role
  ) then
    return;
  end if;

  if lower(coalesce(
       private.admin_notification_request_status(p_request_table, p_request_id),
       ''
     )) in ('approved', 'complete', 'done') then
    return;
  end if;

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
    p_audit_log_id,
    ca.user_id,
    p_request_table,
    p_request_id,
    false,
    coalesce(p_changed_at, now()),
    coalesce(p_changed_at, now())
  from (
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
  ) ca
  where ca.effective_line_slug = v_slug
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
  where public.admin_notification.audit_log_id is distinct from excluded.audit_log_id;
end;
$$;

revoke all on function private.enqueue_admin_notification_for_audit(uuid, text, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- AFTER INSERT trigger. Wrapped in an exception guard so notification failures
-- can never roll back the underlying request/audit write.
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
      new.request_table,
      new.request_id,
      new.changed_by,
      new.changed_by_role,
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

commit;
