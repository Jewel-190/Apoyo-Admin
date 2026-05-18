-- Admin notifications v2: minimal rows (who, which assistance request, which audit movement, read flag).
-- Only public.assistance_requests audit rows participate; category routing uses assistance_categories + admins binding.
-- Drops legacy admin_notification shape (request_table duplication, etc.).

begin;

set search_path = public, private;

-- Drop dependents tied to the old table shape.
drop policy if exists "Admins can read own notifications" on public.admin_notification;
drop policy if exists "Admins can update own notifications" on public.admin_notification;
drop policy if exists "No direct insert from client" on public.admin_notification;
drop policy if exists "No direct delete from client" on public.admin_notification;

drop trigger if exists trg_admin_notification_updated_at on public.admin_notification;

drop table if exists public.admin_notification cascade;

drop function if exists public.get_latest_notifications_for_admin(uuid);
drop function if exists public.mark_request_notifications_read_for_admin(uuid, text, uuid);
drop function if exists public.get_unread_notification_count_for_admin(uuid);
drop function if exists public.process_admin_notifications();

-- ---------------------------------------------------------------------------
-- Table (minimal)
-- ---------------------------------------------------------------------------
create table public.admin_notification (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admins (user_id) on delete cascade,
  audit_log_id uuid not null references public.audit_logs (id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_notification_admin_audit_uidx unique (admin_user_id, audit_log_id)
);

create index admin_notification_admin_user_id_idx
  on public.admin_notification (admin_user_id);

create index admin_notification_audit_log_id_idx
  on public.admin_notification (audit_log_id);

create index admin_notification_unread_idx
  on public.admin_notification (admin_user_id)
  where is_read = false;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.update_admin_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_admin_notification_updated_at
before update on public.admin_notification
for each row
execute function public.update_admin_notification_updated_at();

-- ---------------------------------------------------------------------------
-- Category + movement helpers
-- ---------------------------------------------------------------------------
create or replace function private.assistance_category_id_for_request(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.category_id
  from public.assistance_requests r
  join public.assistance_services s
    on s.service_key = r.service_key
  where r.id = p_request_id
  limit 1;
$$;

revoke all on function private.assistance_category_id_for_request(uuid) from public;
grant execute on function private.assistance_category_id_for_request(uuid) to service_role;

create or replace function private.admin_assistance_category_id(p_admin_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_cat uuid;
  v_slug text;
begin
  select lower(trim(coalesce(a.role, ''))),
         a.category_id,
         nullif(lower(trim(coalesce(a.service_type, ''))), '')
    into v_role, v_cat, v_slug
  from public.admins a
  where a.user_id = p_admin_user_id
  limit 1;

  if v_cat is not null then
    return v_cat;
  end if;

  if v_slug is not null then
    select c.id
      into v_cat
      from public.assistance_categories c
      where lower(trim(c.slug)) = v_slug
      limit 1;
    return v_cat;
  end if;

  if v_role in ('medical_admin', 'financial_admin', 'burial_admin') then
    select c.id
      into v_cat
      from public.assistance_categories c
      where c.admin_role_key = v_role
      limit 1;
    return v_cat;
  end if;

  return null;
end;
$$;

revoke all on function private.admin_assistance_category_id(uuid) from public;
grant execute on function private.admin_assistance_category_id(uuid) to service_role;

-- Audit rows reference assistance_requests by request_id only (no request_table / changed_by_role on remote).
create or replace function private.is_user_initiated_assistance_audit(
  p_request_id uuid,
  p_changed_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_request_id is null then
    return false;
  end if;

  select r.user_id
    into v_owner
    from public.assistance_requests r
    where r.id = p_request_id
    limit 1;

  if v_owner is null then
    return false;
  end if;

  return p_changed_by is not null and p_changed_by = v_owner;
end;
$$;

revoke all on function private.is_user_initiated_assistance_audit(uuid, uuid) from public;
grant execute on function private.is_user_initiated_assistance_audit(uuid, uuid) to service_role;

drop function if exists private.is_user_initiated_audit_for_assistance_request(text, uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- Processor (service_role): one row per admin per request (latest audit); request via audit_logs.request_id
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

-- Optional count helper (edge / dashboards) — same visibility rules as UI filter client-side.
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.admin_notification enable row level security;

create policy "admin_notification_select_own"
  on public.admin_notification
  for select
  to authenticated
  using (auth.uid() = admin_user_id);

create policy "admin_notification_update_own"
  on public.admin_notification
  for update
  to authenticated
  using (auth.uid() = admin_user_id)
  with check (auth.uid() = admin_user_id);

create policy "admin_notification_no_client_insert"
  on public.admin_notification
  for insert
  to authenticated
  with check (false);

create policy "admin_notification_no_client_delete"
  on public.admin_notification
  for delete
  to authenticated
  using (false);

grant select, update on public.admin_notification to authenticated;
grant all on public.admin_notification to service_role;

comment on table public.admin_notification is
  'Inbox: (admin_user_id, audit_log_id). Request = audit_logs.request_id. admin_user_id is required for RLS and per-admin read state.';

commit;
