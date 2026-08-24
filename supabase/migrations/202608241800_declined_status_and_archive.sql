-- Add `declined` as a terminal assistance request status (alongside approved).
-- Archive lists approved + declined. Admin inbox treats declined like approved.

begin;

do $$
declare
  rec record;
  dropped boolean := false;
begin
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'assistance_requests'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format(
      'alter table public.assistance_requests drop constraint if exists %I',
      rec.conname
    );
    dropped := true;
  end loop;

  if dropped then
    alter table public.assistance_requests
      add constraint assistance_requests_status_check check (
        status = any (
          array[
            'draft'::text,
            'pending'::text,
            'in progress'::text,
            'action required'::text,
            'resubmitted'::text,
            'for approval'::text,
            'scheduled'::text,
            'case study'::text,
            'approved'::text,
            'declined'::text
          ]
        )
      );
  end if;
end $$;

create index if not exists assistance_requests_archive_submitted_idx
  on public.assistance_requests (service_id, submitted_at desc nulls last)
  where status in ('approved', 'declined');

delete from public.admin_notification an
using public.assistance_requests r
where an.assistance_request_id = r.id
  and lower(trim(coalesce(r.status::text, '')))
    in ('declined', 'denied', 'rejected');

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
    and lower(trim(coalesce(r.status::text, '')))
      in ('approved', 'complete', 'done', 'declined', 'denied', 'rejected');

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
            not in (
              'approved',
              'complete',
              'done',
              'draft',
              'declined',
              'denied',
              'rejected'
            )
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

  if v_status is null
     or v_status in (
       'approved',
       'complete',
       'done',
       'draft',
       'declined',
       'denied',
       'rejected'
     )
  then
    if v_status in (
      'approved',
      'complete',
      'done',
      'declined',
      'denied',
      'rejected'
    ) then
      delete from public.admin_notification
      where assistance_request_id = p_request_id;
    end if;
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

comment on function public.process_admin_notifications() is
  'Rebuilds admin_notification inbox. Terminal statuses (approved, declined) are excluded.';

comment on function private.enqueue_admin_notification_for_audit(uuid, uuid, uuid, timestamptz) is
  'Live enqueue of admin_notification rows. Approved and declined requests leave the inbox.';

commit;
