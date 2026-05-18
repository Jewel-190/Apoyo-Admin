-- Slim admin_notification: only admin_user_id + audit_log_id (+ read flags, timestamps).
-- assistance_request_id removed (always audit_logs.request_id → assistance_requests.id).
-- admin_user_id is kept: RLS and per-admin is_read require it; audit_log does not name the recipient.

begin;

set search_path = public, private;

alter table public.admin_notification
  drop constraint if exists admin_notification_admin_request_uidx;

drop index if exists public.admin_notification_assistance_request_id_idx;

alter table public.admin_notification
  drop column if exists assistance_request_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_notification_admin_audit_uidx'
      and conrelid = 'public.admin_notification'::regclass
  ) then
    alter table public.admin_notification
      add constraint admin_notification_admin_audit_uidx unique (admin_user_id, audit_log_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Processor: one row per line admin per request (latest applicant audit); swap audit_log_id.
-- ---------------------------------------------------------------------------
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
      la.event_at
    from latest_audits la
    join public.admins a
      on a.user_id is not null
      and lower(trim(coalesce(a.role, ''))) <> 'super_admin'
    where private.assistance_category_id_for_request(la.assistance_request_id)
        = private.admin_assistance_category_id(a.user_id)
      and private.assistance_category_id_for_request(la.assistance_request_id) is not null
      and private.admin_assistance_category_id(a.user_id) is not null
  ),
  removed as (
    delete from public.admin_notification an
    using targets t, audit_logs al_old, audit_logs al_new
    where an.admin_user_id = t.admin_user_id
      and al_old.id = an.audit_log_id
      and al_new.id = t.audit_log_id
      and al_old.request_id = al_new.request_id
      and al_old.id is distinct from al_new.id
    returning an.id
  ),
  upserted as (
    insert into public.admin_notification (
      admin_user_id,
      audit_log_id,
      is_read,
      created_at,
      updated_at
    )
    select
      t.admin_user_id,
      t.audit_log_id,
      false,
      t.event_at,
      t.event_at
    from targets t
    on conflict (admin_user_id, audit_log_id) do nothing
    returning 1
  )
  select coalesce((select count(*)::int from upserted), 0)
  into v_upserted;

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
    and private.is_user_initiated_assistance_audit(al.request_id, al.changed_by)
    and exists (
      select 1
      from public.assistance_requests r
      where r.id = al.request_id
        and lower(trim(coalesce(r.status::text, '')))
          not in ('approved', 'complete', 'done', 'draft')
    )
    and (auth.role() = 'service_role' or auth.uid() = p_admin_user_id);
$$;

revoke all on function public.get_unread_notification_count_for_admin(uuid) from public;
grant execute on function public.get_unread_notification_count_for_admin(uuid) to authenticated, service_role;

comment on table public.admin_notification is
  'Line-admin inbox: (admin_user_id, audit_log_id) points at the latest applicant audit for a request; request id = audit_logs.request_id. admin_user_id is required for RLS and per-admin read state.';

commit;
