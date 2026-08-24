-- Assistance / service catalog retention.
-- Catalog edits and archives must not rewrite or hide historical requests,
-- notifications, audit logs, or reports. Live catalog pickers stay active-only.

begin;

set search_path = public, private;

-- ---------------------------------------------------------------------------
-- 1. Immutable name/line snapshots on each request
-- ---------------------------------------------------------------------------

alter table public.assistance_requests
  add column if not exists category_id uuid,
  add column if not exists category_slug text not null default '',
  add column if not exists service_name text not null default '',
  add column if not exists assistance_name text not null default '';

comment on column public.assistance_requests.category_id is
  'Assistance line captured when the request row was written. Catalog moves do not overwrite this.';
comment on column public.assistance_requests.category_slug is
  'Category slug captured when the request row was written. Used for historical theming.';
comment on column public.assistance_requests.service_name is
  'Service display name captured when the request row was written. Catalog renames do not overwrite this.';
comment on column public.assistance_requests.assistance_name is
  'Assistance line name captured when the request row was written. Catalog renames do not overwrite this.';

update public.assistance_requests r
set
  category_id = s.category_id,
  category_slug = coalesce(nullif(btrim(c.slug), ''), r.category_slug),
  service_name = coalesce(nullif(btrim(s.display_name), ''), r.service_name),
  assistance_name = coalesce(nullif(btrim(c.assistance_name), ''), r.assistance_name)
from public.assistance_services s
left join public.assistance_categories c on c.id = s.category_id
where r.service_id = s.id
  and (
    r.category_id is null
    or btrim(coalesce(r.category_slug, '')) = ''
    or btrim(coalesce(r.service_name, '')) = ''
    or btrim(coalesce(r.assistance_name, '')) = ''
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assistance_requests'::regclass
      and conname = 'assistance_requests_category_id_fkey'
  ) then
    alter table public.assistance_requests
      add constraint assistance_requests_category_id_fkey
      foreign key (category_id)
      references public.assistance_categories (id)
      on update restrict
      on delete restrict;
  end if;
end $$;

create index if not exists assistance_requests_category_id_idx
  on public.assistance_requests (category_id)
  where category_id is not null;

create or replace function public.stamp_assistance_request_catalog_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_category_slug text;
  v_service_name text;
  v_assistance_name text;
begin
  if tg_op = 'UPDATE'
     and new.service_id is not distinct from old.service_id
     and new.category_id is not null
     and btrim(coalesce(new.service_name, '')) <> ''
     and btrim(coalesce(new.assistance_name, '')) <> ''
     and btrim(coalesce(new.category_slug, '')) <> ''
  then
    return new;
  end if;

  select
    s.category_id,
    coalesce(nullif(btrim(c.slug), ''), ''),
    coalesce(nullif(btrim(s.display_name), ''), ''),
    coalesce(nullif(btrim(c.assistance_name), ''), '')
  into v_category_id, v_category_slug, v_service_name, v_assistance_name
  from public.assistance_services s
  left join public.assistance_categories c on c.id = s.category_id
  where s.id = new.service_id;

  if not found then
    return new;
  end if;

  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    new.category_id := v_category_id;
    new.category_slug := coalesce(v_category_slug, '');
    new.service_name := coalesce(v_service_name, '');
    new.assistance_name := coalesce(v_assistance_name, '');
    return new;
  end if;

  if new.category_id is null then
    new.category_id := v_category_id;
  end if;
  if btrim(coalesce(new.category_slug, '')) = '' then
    new.category_slug := coalesce(v_category_slug, '');
  end if;
  if btrim(coalesce(new.service_name, '')) = '' then
    new.service_name := coalesce(v_service_name, '');
  end if;
  if btrim(coalesce(new.assistance_name, '')) = '' then
    new.assistance_name := coalesce(v_assistance_name, '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stamp_assistance_request_catalog_snapshot
  on public.assistance_requests;

create trigger trg_stamp_assistance_request_catalog_snapshot
before insert or update on public.assistance_requests
for each row
execute function public.stamp_assistance_request_catalog_snapshot();

comment on function public.stamp_assistance_request_catalog_snapshot() is
  'Stamps request catalog snapshots on insert or service_id change. Renames never rewrite existing snapshots.';

-- ---------------------------------------------------------------------------
-- 2. Notification routing uses the request snapshot, not the live catalog
-- ---------------------------------------------------------------------------

create or replace function private.assistance_category_id_for_request(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    r.category_id,
    s.category_id
  )
  from public.assistance_requests r
  left join public.assistance_services s on s.id = r.service_id
  where r.id = p_request_id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Historical access: archive/rename must not hide requests, logs, or files
-- ---------------------------------------------------------------------------

create or replace function public.admin_can_access_assistance_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_id
      and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
      and (
        r.user_id = auth.uid()
        or public.is_superadmin(auth.uid())
        or public.line_admin_matches_category(
          auth.uid(),
          coalesce(
            r.category_id,
            (
              select s.category_id
              from public.assistance_services s
              where s.id = r.service_id
            )
          )
        )
      )
  );
$$;

comment on function public.admin_can_access_assistance_request(uuid) is
  'Applicant, superadmin, or line admin of the request snapshot line. Catalog active flags are ignored.';

create or replace function public.admin_can_access_user_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.user_id = p_user_id
      and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
      and public.line_admin_matches_category(
        auth.uid(),
        coalesce(
          r.category_id,
          (
            select s.category_id
            from public.assistance_services s
            where s.id = r.service_id
          )
        )
      )
  );
$$;

comment on function public.admin_can_access_user_profile(uuid) is
  'True when the caller is a line admin with a non-draft historical request from this applicant.';

create or replace function public.can_access_request_attachment(p_request_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_uid
      and (
        r.user_id = auth.uid()
        or (
          nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
          and (
            public.is_superadmin(auth.uid())
            or public.line_admin_matches_category(
              auth.uid(),
              coalesce(
                r.category_id,
                (
                  select s.category_id
                  from public.assistance_services s
                  where s.id = r.service_id
                )
              )
            )
          )
        )
      )
  );
$$;

create or replace function public.can_access_request_attachment(
  p_request_table text,
  p_request_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_request_attachment(p_request_uid);
$$;

drop policy if exists assistance_requests_admin_select on public.assistance_requests;
drop policy if exists assistance_requests_admin_update on public.assistance_requests;

create policy assistance_requests_admin_select on public.assistance_requests
  for select
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and public.line_admin_matches_category(
          a.user_id,
          coalesce(
            assistance_requests.category_id,
            (
              select s.category_id
              from public.assistance_services s
              where s.id = assistance_requests.service_id
            )
          )
        )
    )
  );

create policy assistance_requests_admin_update on public.assistance_requests
  for update
  to authenticated
  using (
    nullif(trim(lower(status::text)), '') is distinct from 'draft'
    and exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and public.line_admin_matches_category(
          a.user_id,
          coalesce(
            assistance_requests.category_id,
            (
              select s.category_id
              from public.assistance_services s
              where s.id = assistance_requests.service_id
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
        and public.line_admin_matches_category(
          a.user_id,
          coalesce(
            assistance_requests.category_id,
            (
              select s.category_id
              from public.assistance_services s
              where s.id = assistance_requests.service_id
            )
          )
        )
    )
  );

-- Historical catalog reads: archived rows stay visible to people who already
-- have a request on them, and to the line admin of that assistance. Public
-- / mobile home catalog remains active-only via the existing active policies.

drop policy if exists assistance_services_select_history on public.assistance_services;
create policy assistance_services_select_history
  on public.assistance_services
  for select
  to authenticated
  using (
    public.is_superadmin(auth.uid())
    or public.line_admin_matches_category(auth.uid(), category_id)
    or exists (
      select 1
      from public.assistance_requests r
      where r.service_id = assistance_services.id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists assistance_categories_select_history on public.assistance_categories;
create policy assistance_categories_select_history
  on public.assistance_categories
  for select
  to authenticated
  using (
    public.is_superadmin(auth.uid())
    or public.line_admin_matches_category(auth.uid(), id)
    or exists (
      select 1
      from public.assistance_requests r
      where r.user_id = auth.uid()
        and (
          r.category_id = assistance_categories.id
          or exists (
            select 1
            from public.assistance_services s
            where s.id = r.service_id
              and s.category_id = assistance_categories.id
          )
        )
    )
  );

drop policy if exists assistance_requirements_select_history on public.assistance_requirements;
create policy assistance_requirements_select_history
  on public.assistance_requirements
  for select
  to authenticated
  using (
    public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.assistance_services s
      where s.id = assistance_requirements.service_id
        and public.line_admin_matches_category(auth.uid(), s.category_id)
    )
    or exists (
      select 1
      from public.assistance_requests r
      where r.service_id = assistance_requirements.service_id
        and r.user_id = auth.uid()
    )
  );

comment on column public.assistance_categories.active is
  'Live catalog flag. false hides the row from new picks (mobile home / CMS lists). Historical requests, logs, and notifications keep using the row and their snapshots.';

comment on column public.assistance_services.active is
  'Live catalog flag. false hides the row from new picks (mobile home / CMS lists). Historical requests, logs, and notifications keep using the row and their snapshots.';

commit;
