-- One inbox row per (line admin, assistance request): follow latest applicant audit
-- without accumulating rows per historical audit_log_id.

begin;

set search_path = public, private;

-- 1) Denormalize request id for stable upsert key
alter table public.admin_notification
  add column if not exists assistance_request_id uuid;

-- Orphans / bad pointers
delete from public.admin_notification an
where not exists (
  select 1
  from public.audit_logs al
  where al.id = an.audit_log_id
);

update public.admin_notification an
set assistance_request_id = al.request_id
from public.audit_logs al
where al.id = an.audit_log_id
  and an.assistance_request_id is distinct from al.request_id;

delete from public.admin_notification
where assistance_request_id is null;

-- 2) Dedupe legacy rows (same admin + same request, different audit pointers)
with ranked as (
  select
    an.id,
    row_number() over (
      partition by an.admin_user_id, an.assistance_request_id
      order by coalesce(an.updated_at, an.created_at) desc nulls last, an.id desc
    ) as rn
  from public.admin_notification an
)
delete from public.admin_notification an
where an.id in (select id from ranked where rn > 1);

alter table public.admin_notification
  alter column assistance_request_id set not null;

alter table public.admin_notification
  drop constraint if exists admin_notification_assistance_request_id_fkey;

alter table public.admin_notification
  add constraint admin_notification_assistance_request_id_fkey
  foreign key (assistance_request_id)
  references public.assistance_requests (id)
  on delete cascade;

create index if not exists admin_notification_assistance_request_id_idx
  on public.admin_notification (assistance_request_id);

-- 3) Replace uniqueness: (admin, request) not (admin, audit)
alter table public.admin_notification
  drop constraint if exists admin_notification_admin_audit_uidx;

alter table public.admin_notification
  add constraint admin_notification_admin_request_uidx
  unique (admin_user_id, assistance_request_id);

-- ---------------------------------------------------------------------------
-- Processor: upsert one row per line admin per request → latest applicant audit
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
      la.assistance_request_id,
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

comment on table public.admin_notification is
  'Line-admin inbox: at most one row per (admin_user_id, assistance_request_id); '
  'audit_log_id is the latest applicant movement for that request. '
  'Updated by process_admin_notifications().';

commit;
