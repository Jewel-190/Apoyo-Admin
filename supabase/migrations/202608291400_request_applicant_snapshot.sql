-- Freeze applicant identity on each assistance request at submit time.
-- Profile edits (superadmin Users / mobile Manage Account) must not rewrite
-- historical request details. Drafts keep refreshing from public.users until
-- submitted_at is set.
--
-- Existing rows are backfilled from the current users row (best effort;
-- identity before this migration was never stored). The trigger is created
-- after that backfill so submitted rows are not frozen as empty.

alter table public.assistance_requests
  add column if not exists applicant_first_name text,
  add column if not exists applicant_middle_name text,
  add column if not exists applicant_last_name text,
  add column if not exists applicant_suffix text,
  add column if not exists applicant_sex text,
  add column if not exists applicant_birth_date date,
  add column if not exists applicant_email text,
  add column if not exists applicant_contact_number text,
  add column if not exists applicant_address text,
  add column if not exists applicant_barangay text,
  add column if not exists applicant_voter_id_number text,
  add column if not exists applicant_snapshot_at timestamptz;

comment on column public.assistance_requests.applicant_first_name is
  'Applicant first name captured at submit (or latest draft refresh). Immutable after submitted_at.';
comment on column public.assistance_requests.applicant_snapshot_at is
  'When applicant_* columns were last stamped from public.users. Frozen after submit.';

create or replace function public.stamp_assistance_request_applicant_snapshot()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  u public.users%rowtype;
begin
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    new.applicant_first_name := old.applicant_first_name;
    new.applicant_middle_name := old.applicant_middle_name;
    new.applicant_last_name := old.applicant_last_name;
    new.applicant_suffix := old.applicant_suffix;
    new.applicant_sex := old.applicant_sex;
    new.applicant_birth_date := old.applicant_birth_date;
    new.applicant_email := old.applicant_email;
    new.applicant_contact_number := old.applicant_contact_number;
    new.applicant_address := old.applicant_address;
    new.applicant_barangay := old.applicant_barangay;
    new.applicant_voter_id_number := old.applicant_voter_id_number;
    new.applicant_snapshot_at := old.applicant_snapshot_at;
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  select * into u from public.users where id = new.user_id;
  if not found then
    return new;
  end if;

  new.applicant_first_name := nullif(btrim(coalesce(u.first_name, '')), '');
  new.applicant_middle_name := nullif(btrim(coalesce(u.middle_name, '')), '');
  new.applicant_last_name := nullif(btrim(coalesce(u.last_name, '')), '');
  new.applicant_suffix := nullif(btrim(coalesce(u.suffix, '')), '');
  new.applicant_sex := nullif(btrim(coalesce(u.sex::text, '')), '');
  new.applicant_birth_date := u.birth_date;
  new.applicant_email := nullif(btrim(coalesce(u.email, '')), '');
  new.applicant_contact_number := nullif(btrim(coalesce(u.contact_number, '')), '');
  new.applicant_address := nullif(btrim(coalesce(u.address, '')), '');
  new.applicant_barangay := nullif(btrim(coalesce(u.barangay, '')), '');
  new.applicant_voter_id_number := nullif(btrim(coalesce(u.voter_id_number, '')), '');
  new.applicant_snapshot_at := now();
  return new;
end;
$$;

comment on function public.stamp_assistance_request_applicant_snapshot() is
  'Copies public.users onto assistance_requests.applicant_* until submit; then immutable.';

drop trigger if exists trg_stamp_assistance_request_applicant_snapshot on public.assistance_requests;

update public.assistance_requests r
set
  applicant_first_name = nullif(btrim(coalesce(u.first_name, '')), ''),
  applicant_middle_name = nullif(btrim(coalesce(u.middle_name, '')), ''),
  applicant_last_name = nullif(btrim(coalesce(u.last_name, '')), ''),
  applicant_suffix = nullif(btrim(coalesce(u.suffix, '')), ''),
  applicant_sex = nullif(btrim(coalesce(u.sex::text, '')), ''),
  applicant_birth_date = u.birth_date,
  applicant_email = nullif(btrim(coalesce(u.email, '')), ''),
  applicant_contact_number = nullif(btrim(coalesce(u.contact_number, '')), ''),
  applicant_address = nullif(btrim(coalesce(u.address, '')), ''),
  applicant_barangay = nullif(btrim(coalesce(u.barangay, '')), ''),
  applicant_voter_id_number = nullif(btrim(coalesce(u.voter_id_number, '')), ''),
  applicant_snapshot_at = coalesce(r.submitted_at, r.created_at, now())
from public.users u
where r.user_id = u.id
  and r.applicant_snapshot_at is null;

create trigger trg_stamp_assistance_request_applicant_snapshot
  before insert or update on public.assistance_requests
  for each row
  execute function public.stamp_assistance_request_applicant_snapshot();

revoke all on function public.stamp_assistance_request_applicant_snapshot() from public, anon;
grant execute on function public.stamp_assistance_request_applicant_snapshot() to authenticated, service_role;

create or replace function private.enqueue_super_admin_notification()
returns trigger
language plpgsql
security definer
set search_path to public, private
as $$
declare
  v_new text;
  v_old text;
  v_event text;
  v_name text;
  v_code text;
  v_title text;
  v_body text;
  v_service text;
  v_assistance text;
begin
  v_new := lower(trim(coalesce(new.status::text, '')));
  v_old := lower(trim(coalesce(old.status::text, '')));

  if tg_op = 'UPDATE' and v_new = v_old then
    return new;
  end if;

  if v_new = 'pending' then
    v_event := 'submitted';
  elsif v_new = 'approved' then
    v_event := 'approved';
  elsif v_new = 'declined' then
    v_event := 'declined';
  else
    return new;
  end if;

  v_name := nullif(
    trim(
      concat_ws(
        ' ',
        nullif(trim(coalesce(new.applicant_first_name, '')), ''),
        nullif(trim(coalesce(new.applicant_middle_name, '')), ''),
        nullif(trim(coalesce(new.applicant_last_name, '')), ''),
        nullif(trim(coalesce(new.applicant_suffix, '')), '')
      )
    ),
    ''
  );
  if v_name is null then
    v_name := coalesce(private.applicant_display_name(new.user_id), 'An applicant');
  end if;

  v_code := nullif(trim(coalesce(new.request_code, '')), '');
  v_service := nullif(trim(coalesce(new.service_name, '')), '');
  v_assistance := nullif(trim(coalesce(new.assistance_name, '')), '');

  if v_event = 'submitted' then
    v_title := 'New request submitted';
    v_body := v_name || ' submitted ' || coalesce(v_code, 'a request');
  elsif v_event = 'approved' then
    v_title := 'Request approved';
    v_body := coalesce(v_code, 'A request') || ' for ' || v_name || ' was approved';
  else
    v_title := 'Request declined';
    v_body := coalesce(v_code, 'A request') || ' for ' || v_name || ' was declined';
  end if;

  if v_service is not null then
    v_body := v_body || ' · ' || v_service;
  end if;

  insert into public.super_admin_notification (
    request_id,
    event_type,
    status,
    title,
    body,
    request_code,
    applicant_name,
    applicant_user_id,
    service_name,
    assistance_name,
    metadata
  ) values (
    new.id,
    v_event,
    v_new,
    left(v_title, 180),
    left(v_body, 500),
    v_code,
    v_name,
    new.user_id,
    v_service,
    v_assistance,
    jsonb_build_object(
      'previous_status', nullif(v_old, ''),
      'service_id', new.service_id
    )
  );

  return new;
exception
  when others then
    raise warning 'super_admin_notification enqueue failed for request %: %', new.id, sqlerrm;
    return new;
end;
$$;

notify pgrst, 'reload schema';

