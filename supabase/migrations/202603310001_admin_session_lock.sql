-- Local-only bootstrap: public+private schema snapshot from the linked project.
-- Remote already applied version 202603310001, so this file is not re-run there.
-- Later already-applied migrations are no-ops so an empty local database can start.



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."attachment_file_type" AS ENUM (
    'letter',
    'voterId',
    'validId',
    'birthCert',
    'barangay',
    'indigency',
    'abstract',
    'bill',
    'medCert',
    'rx',
    'lab',
    'prescription',
    'quotation',
    'deathCert',
    'cremationCert',
    'attachment'
);


ALTER TYPE "public"."attachment_file_type" OWNER TO "postgres";


CREATE TYPE "public"."attachment_status" AS ENUM (
    'pending',
    'in progress',
    'in_progress',
    'approved',
    'action_required',
    'resubmitted'
);


ALTER TYPE "public"."attachment_status" OWNER TO "postgres";


CREATE TYPE "public"."service_type_id" AS ENUM (
    'hospital',
    'treatment',
    'operations',
    'emergency-finance',
    'burial-money',
    'burial-site',
    'cremation',
    'columbarium'
);


ALTER TYPE "public"."service_type_id" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_can_access_assistance_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_id
      and (
        r.user_id = auth.uid()
        or public.rls_admin_can_access_request_row(
          r.status::text,
          r.category_id,
          r.service_id
        )
      )
  );
$$;


ALTER FUNCTION "public"."admin_can_access_assistance_request"("p_request_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_can_access_assistance_request"("p_request_id" "uuid") IS 'Applicant, superadmin, or line admin of the request snapshot line. Catalog active flags are ignored.';



CREATE OR REPLACE FUNCTION "public"."admin_can_access_user_profile"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.user_id = p_user_id
      and public.rls_admin_can_access_request_row(
        r.status::text,
        r.category_id,
        r.service_id
      )
  );
$$;


ALTER FUNCTION "public"."admin_can_access_user_profile"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_can_access_user_profile"("p_user_id" "uuid") IS 'True when the caller is a superadmin or a line admin with a non-draft historical request from this applicant.';



CREATE OR REPLACE FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_uid uuid := auth.uid();
  audit_action text;
  old_status text;
  new_status text;
  result jsonb;
  v_request_table text := 'assistance_requests';
  effective_request_id uuid;
  v_service_id uuid;
begin
  if caller_uid is null then
    raise exception 'admin_request_op requires authenticated caller'
      using errcode = '42501';
  end if;

  if not public.is_superadmin(caller_uid) then
    raise exception 'admin_request_op requires super_admin role'
      using errcode = '42501';
  end if;

  if op not in ('insert', 'update', 'delete', 'transition_status') then
    raise exception 'admin_request_op: unsupported op %', op
      using errcode = '22023';
  end if;

  if op in ('update', 'delete', 'transition_status') and request_id is not null then
    select r.status into old_status
    from public.assistance_requests r
    where r.id = request_id;
  end if;

  if op = 'insert' then
    audit_action := 'INSERT';
    v_service_id := nullif(trim(coalesce(patch->>'service_id', '')), '')::uuid;

    if v_service_id is null and patch ? 'service_id' then
      raise exception 'admin_request_op: invalid service_id'
        using errcode = '22023';
    end if;

    if v_service_id is null then
      raise exception 'admin_request_op: patch.service_id is required'
        using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.assistance_services s where s.id = v_service_id
    ) then
      raise exception 'admin_request_op: unknown service_id %', v_service_id
        using errcode = '22023';
    end if;

    insert into public.assistance_requests (
      id, user_id, service_id, status, additional_info,
      financial_request_type, request_code, submitted_at, case_study_date, payload
    )
    values (
      coalesce(request_id, gen_random_uuid()),
      (patch->>'user_id')::uuid,
      v_service_id,
      coalesce(patch->>'status', 'pending'),
      patch->>'additional_info',
      patch->>'financial_request_type',
      patch->>'request_code',
      nullif(patch->>'submitted_at', '')::timestamptz,
      nullif(patch->>'case_study_date', '')::timestamptz,
      coalesce(patch->'payload', '{}'::jsonb)
    )
    returning to_jsonb(public.assistance_requests.*) into result;

    new_status := coalesce(patch->>'status', 'pending');
    effective_request_id := coalesce(request_id, (result->>'id')::uuid);

  elsif op = 'update' or op = 'transition_status' then
    audit_action := case when op = 'transition_status' then 'STATUS_CHANGE' else 'UPDATE' end;
    update public.assistance_requests r
    set
      status = coalesce(patch->>'status', r.status),
      additional_info = coalesce(patch->>'additional_info', r.additional_info),
      financial_request_type = coalesce(patch->>'financial_request_type', r.financial_request_type),
      submitted_at = coalesce(nullif(patch->>'submitted_at', '')::timestamptz, r.submitted_at),
      case_study_date = coalesce(nullif(patch->>'case_study_date', '')::timestamptz, r.case_study_date),
      request_code = coalesce(patch->>'request_code', r.request_code),
      payload = coalesce(patch->'payload', r.payload),
      updated_at = now()
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    new_status := coalesce(patch->>'status', old_status);
    effective_request_id := request_id;

  elsif op = 'delete' then
    audit_action := 'DELETE';
    effective_request_id := request_id;
    new_status := 'deleted';

    if not exists (
      select 1 from public.assistance_requests r where r.id = request_id
    ) then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;

    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      effective_request_id,
      'DELETE',
      coalesce(nullif(old_status, ''), 'unknown'),
      'deleted',
      caller_uid,
      now()
    );

    delete from public.assistance_requests r
    where r.id = request_id
    returning to_jsonb(r.*) into result;

    if result is null then
      raise exception 'admin_request_op: % not found', request_id
        using errcode = 'P0002';
    end if;
  end if;

  if op is distinct from 'delete' then
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      effective_request_id,
      audit_action,
      old_status,
      new_status,
      caller_uid,
      now()
    );
  end if;

  return jsonb_build_object(
    'op', op,
    'table', v_request_table,
    'request_id', effective_request_id,
    'old_status', old_status,
    'new_status', new_status,
    'row', result
  );
end;
$$;


ALTER FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb") IS 'Superadmin writes against public.assistance_requests only. Always writes audit_logs.';



CREATE OR REPLACE FUNCTION "public"."audit_trail_prevent_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'audit_trail rows cannot be changed or removed';
end;
$$;


ALTER FUNCTION "public"."audit_trail_prevent_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_registration_attempt"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_email text;
  v_token uuid;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  -- Optional cleanup of very old attempts.
  delete from private.registration_attempts
  where created_at < now() - interval '30 day';

  v_token := gen_random_uuid();

  insert into private.registration_attempts (email, attempt_token)
  values (v_email, v_token);

  return v_token;
end;
$$;


ALTER FUNCTION "public"."begin_registration_attempt"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_request_attachment"("p_request_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.assistance_requests r
    where r.id = p_request_uid
      and (
        r.user_id = auth.uid()
        or public.rls_admin_can_access_request_row(
          r.status::text,
          r.category_id,
          r.service_id
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_access_request_attachment"("p_request_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_request_attachment"("p_request_table" "text", "p_request_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.can_access_request_attachment(p_request_uid);
$$;


ALTER FUNCTION "public"."can_access_request_attachment"("p_request_table" "text", "p_request_uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_request_attachment"("p_request_table" "text", "p_request_uid" "uuid") IS 'RLS: same as admin_can_access_assistance_request for assistance_requests parent.';



CREATE OR REPLACE FUNCTION "public"."can_access_request_table"("p_request_table" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case public.current_admin_role()
    when 'medical_admin' then public.normalize_request_table_name(p_request_table) in (
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests'
    )
    when 'financial_admin' then public.normalize_request_table_name(p_request_table) in (
      'financial_requests',
      'monetary_requests'
    )
    when 'burial_admin' then public.normalize_request_table_name(p_request_table) in (
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    )
    else false
  end;
$$;


ALTER FUNCTION "public"."can_access_request_table"("p_request_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_audit_log"("p_request_table" "text", "p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_request_id is not null
    and public.admin_can_access_assistance_request(p_request_id);
$$;


ALTER FUNCTION "public"."can_read_audit_log"("p_request_table" "text", "p_request_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_read_audit_log"("p_request_table" "text", "p_request_id" "uuid") IS 'Applicants and line admins (catalog scope) may read audit_logs for assistance_requests.';



CREATE OR REPLACE FUNCTION "public"."cascade_archive_assistance_category"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.active IS NOT DISTINCT FROM OLD.active THEN
    RETURN NEW;
  END IF;

  IF NEW.active = false THEN
    UPDATE public.assistance_services
    SET active = false
    WHERE category_id = NEW.id
      AND active IS DISTINCT FROM false;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cascade_archive_assistance_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_admin_session"("p_user_id" "uuid", "p_email" "text", "p_session_id" "text", "p_ttl_seconds" integer DEFAULT 180) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := timezone('utc', now());
  v_owner_session_id text;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or v_email = '' or v_session_id = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  insert into public.admin_active_sessions (
    user_id,
    email,
    session_id,
    last_seen,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    v_email,
    v_session_id,
    v_now,
    v_now,
    v_now
  )
  on conflict (user_id)
  do update
    set email = excluded.email,
        session_id = excluded.session_id,
        last_seen = v_now,
        updated_at = v_now
    where public.admin_active_sessions.session_id = excluded.session_id
      or public.admin_active_sessions.last_seen <= v_now - make_interval(secs => greatest(coalesce(p_ttl_seconds, 180), 1));

  select session_id
  into v_owner_session_id
  from public.admin_active_sessions
  where user_id = p_user_id;

  return v_owner_session_id = v_session_id;
end;
$$;


ALTER FUNCTION "public"."claim_admin_session"("p_user_id" "uuid", "p_email" "text", "p_session_id" "text", "p_ttl_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_admin_active_sessions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted integer := 0;
begin
  delete from public.admin_active_sessions
  where last_seen <= timezone('utc', now()) - make_interval(secs => 180);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."cleanup_stale_admin_active_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_user_notifications"("p_read_retention" interval DEFAULT '30 days'::interval, "p_remove_superseded" boolean DEFAULT true) RETURNS TABLE("deleted_orphaned" integer, "deleted_superseded" integer, "deleted_expired_read" integer, "total_deleted" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_orphaned integer := 0;
  v_expired integer := 0;
begin
  -- Orphans (request/user removed) are handled by ON DELETE CASCADE, but sweep
  -- any stragglers whose request no longer exists.
  delete from public.user_notification un
  where not exists (
    select 1 from public.assistance_requests r where r.id = un.request_id
  );
  get diagnostics v_orphaned = row_count;

  -- One row per (user_id, request_id) is enforced by a unique constraint, so
  -- "superseded" duplicates no longer accumulate; keep the param for compatibility.

  delete from public.user_notification
  where is_read = true
    and created_at < now() - coalesce(p_read_retention, interval '30 days');
  get diagnostics v_expired = row_count;

  return query
  select v_orphaned, 0, v_expired, v_orphaned + v_expired;
end;
$$;


ALTER FUNCTION "public"."cleanup_user_notifications"("p_read_retention" interval, "p_remove_superseded" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_unread_super_admin_notifications"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.super_admin_notification n
  where p_user_id is not null
    and not exists (
      select 1
      from public.super_admin_notification_read r
      where r.notification_id = n.id
        and r.user_id = p_user_id
    );
$$;


ALTER FUNCTION "public"."count_unread_super_admin_notifications"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_admin_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when a.is_super_admin then 'super_admin'
    when c.slug is not null then lower(trim(c.slug)) || '_admin'
    else null
  end
  from public.admins a
  left join public.assistance_categories c on c.id = a.category_id
  where a.user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."current_admin_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_user_push_token"("p_token" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  update public.user_push_token
  set enabled = false, updated_at = now()
  where user_id = v_uid
    and token = p_token
    and enabled = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."disable_user_push_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_attachment_not_in_progress_for_action_required_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_parent_status text;
begin
  if new.assistance_request_id is null then
    return new;
  end if;

  if not public.is_in_progress_attachment_status(new.status::text) then
    return new;
  end if;

  select r.status::text
  into v_parent_status
  from public.assistance_requests r
  where r.id = new.assistance_request_id;

  if public.is_action_required_request_status(v_parent_status) then
    raise exception using
      errcode = '23514',
      message = 'Cannot set attachment status to In Progress while parent request is Action Required.',
      detail = format(
        'assistance_request_id=%s attachment_uid=%s',
        coalesce(new.assistance_request_id::text, 'null'),
        coalesce(new.uid::text, 'null')
      ),
      hint = 'Set the attachment status to Action Required/Verified or move the request out of Action Required.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_attachment_not_in_progress_for_action_required_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_no_redundant_action_required_resend"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_action_required_request_status(old.status::text)
     and public.is_action_required_request_status(new.status::text) then
    raise exception using
      errcode = '23514',
      message = 'Invalid status transition: request is already Action Required. Resend is blocked until applicant submits changes.',
      detail = format('table=%s id=%s old_status=%s new_status=%s', tg_table_name, new.id::text, coalesce(old.status::text, 'null'), coalesce(new.status::text, 'null')),
      hint = 'Wait for applicant changes (typically status becomes resubmitted) before sending back again.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_no_redundant_action_required_resend"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_no_resubmitted_to_in_progress_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_resubmitted_request_status(old.status::text)
     and public.is_in_progress_request_status(new.status::text) then
    raise exception using
      errcode = '23514',
      message = 'Invalid status transition: resubmitted requests cannot be moved back to in progress.',
      detail = format('table=%s id=%s old_status=%s new_status=%s', tg_table_name, new.id::text, coalesce(old.status::text, 'null'), coalesce(new.status::text, 'null')),
      hint = 'Keep the request in Resubmitted until it is reviewed to Action Required, For Approval, Approved, or another allowed status.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_no_resubmitted_to_in_progress_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_request_action_required_without_in_progress_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_action_required_request_status(new.status::text) then
    return new;
  end if;

  if exists (
    select 1
    from public.request_attachments ra
    where lower(trim(coalesce(ra.request_table::text, ''))) = tg_table_name
      and ra.request_uid::text = new.id::text
      and public.is_in_progress_attachment_status(ra.status::text)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Cannot mark request as Action Required while one or more attachments are still In Progress.',
      detail = format('request_table=%s request_id=%s', tg_table_name, new.id::text),
      hint = 'Resolve all In Progress attachment statuses before setting request to Action Required.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_request_action_required_without_in_progress_attachments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_request_action_required_without_in_progress_or_resubmit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_action_required_request_status(new.status::text) then
    return new;
  end if;

  if exists (
    select 1
    from public.request_attachments ra
    where lower(trim(coalesce(ra.request_table::text, ''))) = tg_table_name
      and ra.request_uid::text = new.id::text
      and (
        public.is_in_progress_attachment_status(ra.status::text)
        or public.is_resubmitted_attachment_status(ra.status::text)
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Cannot mark request as Action Required while one or more attachments are In Progress or Resubmitted.',
      detail = format('request_table=%s request_id=%s', tg_table_name, new.id::text),
      hint = 'Resolve all In Progress/Resubmitted attachments before setting request to Action Required.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_request_action_required_without_in_progress_or_resubmit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_uid uuid;
  v_email text;
  v_latest_token uuid;
  v_token_exists boolean;
  v_not_consumed boolean;
  v_birth_date date;
  v_rv public.registered_voters%rowtype;
  v_submitted_voter_id text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  if p_registered_voter_id is null then
    raise exception 'Registered voter verification is required';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  select ra.attempt_token
    into v_latest_token
  from private.registration_attempts ra
  where ra.email = v_email
    and ra.expires_at > now()
  order by ra.created_at desc
  limit 1;

  if v_latest_token is null then
    raise exception 'No active registration attempt found';
  end if;

  if v_latest_token <> p_attempt_token then
    raise exception 'Registration attempt is outdated. Please restart registration.';
  end if;

  select exists (
    select 1
    from private.registration_attempts
    where attempt_token = p_attempt_token
      and email = v_email
  ) into v_token_exists;

  if not v_token_exists then
    raise exception 'Invalid registration attempt token';
  end if;

  select exists (
    select 1
    from private.registration_attempts
    where attempt_token = p_attempt_token
      and consumed_at is null
  ) into v_not_consumed;

  if not v_not_consumed then
    raise exception 'Registration attempt token already used';
  end if;

  v_birth_date := (nullif(trim(coalesce(p_birth_date, '')), ''))::date;

  select *
    into v_rv
  from public.registered_voters rv
  where rv.id = p_registered_voter_id;

  if not found then
    raise exception 'Invalid registered voter reference';
  end if;

  if private.normalize_registration_name(v_rv.first_name) <> private.normalize_registration_name(p_first_name)
    or private.normalize_registration_name(v_rv.middle_name) <> private.normalize_registration_name(p_middle_name)
    or private.normalize_registration_name(v_rv.last_name) <> private.normalize_registration_name(p_last_name)
    or private.normalize_registration_name(v_rv.suffix) <> private.normalize_registration_name(p_suffix)
    or v_rv.birth_date <> v_birth_date
    or v_rv.sex <> upper(trim(coalesce(p_sex, '')))::char(1)
  then
    raise exception 'registration_voter_registry_mismatch';
  end if;

  v_submitted_voter_id := private.normalize_voter_id(p_voter_id_number);

  if v_submitted_voter_id = '' or length(v_submitted_voter_id) <> 23 then
    raise exception 'Voter ID Number must use the full format 0000-00000-0000000000000-0';
  end if;

  if private.normalize_voter_id(v_rv.voter_id) <> v_submitted_voter_id then
    raise exception 'registration_voter_registry_mismatch';
  end if;

  if exists (
    select 1
    from public.users u
    where u.registered_voter_id = p_registered_voter_id
      and u.id <> v_uid
  ) then
    raise exception 'registration_voter_registry_mismatch';
  end if;

  insert into public.users (
    id,
    first_name,
    middle_name,
    last_name,
    suffix,
    contact_number,
    email,
    voter_id_number,
    address,
    birth_date,
    sex,
    registered_voter_id
  )
  values (
    v_uid,
    p_first_name,
    p_middle_name,
    p_last_name,
    p_suffix,
    p_contact_number,
    v_email,
    v_rv.voter_id,
    p_address,
    v_birth_date,
    p_sex,
    p_registered_voter_id
  )
  on conflict (id) do update set
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    suffix = excluded.suffix,
    contact_number = excluded.contact_number,
    email = excluded.email,
    voter_id_number = excluded.voter_id_number,
    address = excluded.address,
    birth_date = excluded.birth_date,
    sex = excluded.sex,
    registered_voter_id = excluded.registered_voter_id;

  update private.registration_attempts
  set consumed_at = now()
  where attempt_token = p_attempt_token;

  return v_uid;
end;
$$;


ALTER FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") IS 'Completes signup; persists registered_voters.voter_id verbatim in users.voter_id_number.';



CREATE OR REPLACE FUNCTION "public"."format_request_code"("p_code" "text", "p_ts" timestamp with time zone, "p_seq" bigint) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select upper(coalesce(p_code, ''))
         || '-' || to_char(p_ts, 'MMYY')
         || '-' || lpad(p_seq::text, 6, '0');
$$;


ALTER FUNCTION "public"."format_request_code"("p_code" "text", "p_ts" timestamp with time zone, "p_seq" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_burial_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.burial_request_code_seq');
  return public.format_request_code('BUR', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_burial_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_catalog_request_code"("p_prefix" "text", "p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
  v_prefix text;
begin
  v_prefix := upper(
    substring(
      regexp_replace(coalesce(trim(p_prefix), ''), '[^a-zA-Z0-9]', '', 'g')
      from 1 for 6
    )
  );
  if length(v_prefix) < 2 then
    v_prefix := 'ASST';
  end if;

  v_seq := nextval('public.assistance_catalog_request_code_seq');
  return public.format_request_code(v_prefix, coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_catalog_request_code"("p_prefix" "text", "p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_columbarium_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.columbarium_request_code_seq');
  return public.format_request_code('COLU', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_columbarium_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_cremation_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.cremation_request_code_seq');
  return public.format_request_code('CREM', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_cremation_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_financial_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.financial_request_code_seq');
  return public.format_request_code('FIN', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_financial_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_hospitalization_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.hospitalization_request_code_seq');
  return public.format_request_code('HOSP', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_hospitalization_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_medical_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.medical_request_code_seq');
  return public.format_request_code('MED', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_medical_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_monetary_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.monetary_request_code_seq');
  return public.format_request_code('MON', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_monetary_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_request_code_for_service"("p_service" "text", "p_timestamp" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_service text := lower(trim(coalesce(p_service, '')));
  v_category_slug text;
  v_token text;
  v_cms_prefix text;
begin
  if v_service = '' then
    raise exception 'Unsupported service type: %', p_service using errcode = '22023';
  end if;

  if v_service in (
    'hospitalizationreq',
    'hospitalization',
    'hosp',
    'hospital',
    'hospitalization_requests'
  ) then
    return public.generate_hospitalization_request_code(p_timestamp);
  elsif v_service in (
    'treatmentreq',
    'treatment',
    'treat',
    'treatment_requests'
  ) then
    return public.generate_treatment_request_code(p_timestamp);
  elsif v_service in (
    'medicalreq',
    'medical',
    'med',
    'operations',
    'medical_requests'
  ) then
    return public.generate_medical_request_code(p_timestamp);
  elsif v_service in (
    'financialreq',
    'financial',
    'fin',
    'emergency-finance',
    'financial_requests'
  ) then
    return public.generate_financial_request_code(p_timestamp);
  elsif v_service in (
    'monetaryreq',
    'monetary',
    'mon',
    'burial-money',
    'monetary_requests'
  ) then
    return public.generate_monetary_request_code(p_timestamp);
  elsif v_service in (
    'burialreq',
    'burial',
    'bur',
    'burial-site',
    'burial_requests'
  ) then
    return public.generate_burial_request_code(p_timestamp);
  elsif v_service in (
    'cremationreq',
    'cremation',
    'crem',
    'cremation_requests'
  ) then
    return public.generate_cremation_request_code(p_timestamp);
  elsif v_service in (
    'columbariumreq',
    'columbarium',
    'colombarium',
    'colu',
    'columbarium_requests'
  ) then
    return public.generate_columbarium_request_code(p_timestamp);
  end if;

  select nullif(trim(s.request_code), '')
    into v_cms_prefix
  from public.assistance_services s
  where lower(trim(coalesce(s.request_code_token, ''))) = v_service
     or lower(replace(s.id::text, '-', '')) = v_service
  limit 1;

  if v_cms_prefix is not null then
    return public.generate_catalog_request_code(v_cms_prefix, p_timestamp);
  end if;

  select lower(trim(c.slug)), lower(trim(coalesce(s.request_code_token, '')))
    into v_category_slug, v_token
  from public.assistance_services s
  join public.assistance_categories c on c.id = s.category_id
  where lower(trim(coalesce(s.request_code_token, ''))) = v_service
     or lower(replace(s.id::text, '-', '')) = v_service
  limit 1;

  if v_category_slug is not null then
    if v_category_slug = 'medical' then
      if v_token like '%treat%' then
        return public.generate_treatment_request_code(p_timestamp);
      elsif v_token like '%hosp%' or v_token like '%hospital%' then
        return public.generate_hospitalization_request_code(p_timestamp);
      else
        return public.generate_medical_request_code(p_timestamp);
      end if;
    elsif v_category_slug = 'financial' then
      return public.generate_financial_request_code(p_timestamp);
    elsif v_category_slug = 'burial' then
      if v_token like '%crem%' then
        return public.generate_cremation_request_code(p_timestamp);
      elsif v_token like '%colu%' or v_token like '%columbarium%' then
        return public.generate_columbarium_request_code(p_timestamp);
      elsif v_token like '%mon%' or v_token like '%money%' then
        return public.generate_monetary_request_code(p_timestamp);
      else
        return public.generate_burial_request_code(p_timestamp);
      end if;
    else
      return public.generate_catalog_request_code(v_token, p_timestamp);
    end if;
  end if;

  return public.generate_catalog_request_code(v_service, p_timestamp);
end;
$$;


ALTER FUNCTION "public"."generate_request_code_for_service"("p_service" "text", "p_timestamp" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_request_code_for_service"("p_service" "text", "p_timestamp" timestamp with time zone) IS 'Human-readable request codes: legacy tokens, CMS assistance_services.request_code prefix, category heuristics, or generic fallback.';



CREATE OR REPLACE FUNCTION "public"."generate_treatment_request_code"("p_ts" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.treatment_request_code_seq');
  return public.format_request_code('TREAT', coalesce(p_ts, now()), v_seq);
end;
$$;


ALTER FUNCTION "public"."generate_treatment_request_code"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_session_by_user_id"("p_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "session_id" "text", "last_seen" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select s.user_id, s.email, s.session_id, s.last_seen, s.created_at
  from public.admin_active_sessions s
  where s.user_id = p_user_id
    and auth.uid() = p_user_id;
$$;


ALTER FUNCTION "public"."get_admin_session_by_user_id"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_latest_notifications_for_user"("p_user_id" "uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "audit_log_id" "uuid", "request_id" "uuid", "request_table" "text", "action" "text", "old_status" "text", "new_status" "text", "is_read" boolean, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    un.id,
    un.audit_log_id,
    un.request_id,
    'assistance_requests'::text as request_table,
    un.action,
    un.old_status,
    un.new_status,
    un.is_read,
    un.created_at
  from public.user_notification un
  where un.user_id = p_user_id
  order by un.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;


ALTER FUNCTION "public"."get_latest_notifications_for_user"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_count_for_admin"("p_admin_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
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


ALTER FUNCTION "public"."get_unread_notification_count_for_admin"("p_admin_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unread_notification_count_for_user"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.user_notification un
  where un.user_id = p_user_id
    and un.is_read = false;
$$;


ALTER FUNCTION "public"."get_unread_notification_count_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_action_required_request_status"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_status, ''))) in (
    'action required',
    'action_required',
    'requires_action',
    'for_revision',
    'resubmission_required',
    'resubmission required'
  );
$$;


ALTER FUNCTION "public"."is_action_required_request_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins a
    WHERE a.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_session_locked"("p_email" "text", "p_candidate_session_id" "text" DEFAULT NULL::"text", "p_ttl_seconds" integer DEFAULT 180) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_candidate_session_id text := nullif(trim(coalesce(p_candidate_session_id, '')), '');
  v_session_id text;
begin
  if v_email = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  select session_id
  into v_session_id
  from public.admin_active_sessions
  where email = v_email;

  if not found then
    return false;
  end if;

  if v_candidate_session_id is not null and v_candidate_session_id = v_session_id then
    return false;
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."is_admin_session_locked"("p_email" "text", "p_candidate_session_id" "text", "p_ttl_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_any_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and (a.is_super_admin = true or a.category_id is not null)
  );
$$;


ALTER FUNCTION "public"."is_any_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_burial_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'burial'
  );
$$;


ALTER FUNCTION "public"."is_burial_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_financial_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'financial'
  );
$$;


ALTER FUNCTION "public"."is_financial_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_in_progress_attachment_status"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_status, ''))) in ('in progress', 'in_progress');
$$;


ALTER FUNCTION "public"."is_in_progress_attachment_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_in_progress_request_status"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_status, ''))) in ('in progress', 'in_progress');
$$;


ALTER FUNCTION "public"."is_in_progress_request_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_managed_request_table"("p_request_table" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_request_table, ''))) in (
    'hospitalization_requests',
    'treatment_requests',
    'medical_requests',
    'financial_requests',
    'monetary_requests',
    'burial_requests',
    'cremation_requests',
    'columbarium_requests'
  );
$$;


ALTER FUNCTION "public"."is_managed_request_table"("p_request_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_medical_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'medical'
  );
$$;


ALTER FUNCTION "public"."is_medical_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_registration_email_available"("p_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return false;
  end if;

  if exists (
    select 1
    from public.users u
    where lower(trim(coalesce(u.email::text, ''))) = v_email
  ) then
    return false;
  end if;

  if exists (
    select 1
    from auth.users au
    where lower(trim(coalesce(au.email, ''))) = v_email
      and au.email_confirmed_at is not null
  ) then
    return false;
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."is_registration_email_available"("p_email" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_registration_email_available"("p_email" "text") IS 'True when the email is free, or only an unconfirmed Auth user (no public.users profile) exists.';



CREATE OR REPLACE FUNCTION "public"."is_resubmitted_attachment_status"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_status, ''))) in (
    'resubmitted',
    'resubmission',
    'resubmission_required'
  );
$$;


ALTER FUNCTION "public"."is_resubmitted_attachment_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_resubmitted_request_status"("p_status" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_status, ''))) in (
    'resubmitted',
    'resubmission',
    'resubmission_required'
  );
$$;


ALTER FUNCTION "public"."is_resubmitted_request_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = uid
      and a.is_super_admin = true
  );
$$;


ALTER FUNCTION "public"."is_superadmin"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_admin_matches_category"("p_user_id" "uuid", "p_category_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = p_user_id
      and a.is_super_admin = false
      and a.category_id = p_category_id
  );
$$;


ALTER FUNCTION "public"."line_admin_matches_category"("p_user_id" "uuid", "p_category_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."line_admin_matches_category"("p_user_id" "uuid", "p_category_id" "uuid") IS 'True when admin is a non-super line admin pinned to the given assistance category.';



CREATE OR REPLACE FUNCTION "public"."list_super_admin_notifications"("p_user_id" "uuid", "p_page" integer DEFAULT 1, "p_page_size" integer DEFAULT 20, "p_status" "text" DEFAULT 'all'::"text", "p_event_type" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "request_id" "uuid", "event_type" "text", "status" "text", "title" "text", "body" "text", "request_code" "text", "applicant_name" "text", "applicant_user_id" "uuid", "service_name" "text", "assistance_name" "text", "is_read" boolean, "read_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  v_status text := lower(trim(coalesce(p_status, 'all')));
  v_event text := nullif(lower(trim(coalesce(p_event_type, ''))), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_offset integer;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;
  if v_status not in ('all', 'unread', 'read') then
    v_status := 'all';
  end if;
  if v_event is not null and v_event not in ('submitted', 'approved', 'declined') then
    v_event := null;
  end if;
  v_offset := (v_page - 1) * v_size;

  return query
  with inbox as (
    select
      n.id,
      n.created_at,
      n.request_id,
      n.event_type,
      n.status,
      n.title,
      n.body,
      n.request_code,
      n.applicant_name,
      n.applicant_user_id,
      n.service_name,
      n.assistance_name,
      (r.read_at is not null) as is_read,
      r.read_at
    from public.super_admin_notification n
    left join public.super_admin_notification_read r
      on r.notification_id = n.id
     and r.user_id = p_user_id
    where (v_event is null or n.event_type = v_event)
      and (
        v_search is null
        or n.title ilike '%' || v_search || '%'
        or n.body ilike '%' || v_search || '%'
        or coalesce(n.request_code, '') ilike '%' || v_search || '%'
        or coalesce(n.applicant_name, '') ilike '%' || v_search || '%'
        or coalesce(n.service_name, '') ilike '%' || v_search || '%'
      )
      and (
        v_status = 'all'
        or (v_status = 'unread' and r.read_at is null)
        or (v_status = 'read' and r.read_at is not null)
      )
  )
  select
    i.id,
    i.created_at,
    i.request_id,
    i.event_type,
    i.status,
    i.title,
    i.body,
    i.request_code,
    i.applicant_name,
    i.applicant_user_id,
    i.service_name,
    i.assistance_name,
    i.is_read,
    i.read_at,
    count(*) over() as total_count
  from inbox i
  order by i.created_at desc, i.id desc
  offset v_offset
  limit v_size;
end;
$$;


ALTER FUNCTION "public"."list_super_admin_notifications"("p_user_id" "uuid", "p_page" integer, "p_page_size" integer, "p_status" "text", "p_event_type" "text", "p_search" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_request_id uuid;
  v_old_status text;
  v_new_status text;
  v_changed_by uuid;
  v_claim_sub text;
begin
  if TG_TABLE_NAME is distinct from 'assistance_requests' then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  v_claim_sub := nullif(current_setting('request.jwt.claim.sub', true), '');

  if v_claim_sub is null then
    begin
      v_claim_sub := nullif(
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
        ''
      );
    exception
      when others then
        v_claim_sub := null;
    end;
  end if;

  if v_claim_sub is not null
     and v_claim_sub ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_changed_by := v_claim_sub::uuid;
  else
    v_changed_by := null;
  end if;

  if TG_OP = 'INSERT' then
    v_request_id := NEW.id;
    v_old_status := null;
    v_new_status := nullif(NEW.status, '');
    if v_new_status is null then
      return NEW;
    end if;
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      v_request_id, 'INSERT', v_old_status, v_new_status, v_changed_by, now()
    );
    return NEW;

  elsif TG_OP = 'UPDATE' then
    v_request_id := NEW.id;
    v_old_status := nullif(OLD.status, '');
    v_new_status := nullif(NEW.status, '');
    if v_old_status is not distinct from v_new_status then
      return NEW;
    end if;
    if v_new_status is null then
      return NEW;
    end if;
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      v_request_id, 'UPDATE', v_old_status, v_new_status, v_changed_by, now()
    );
    return NEW;

  elsif TG_OP = 'DELETE' then
    -- If the owning Auth user no longer exists, this delete is almost certainly
    -- cascading from account removal. Requests should normally SET NULL instead;
    -- still skip noisy DELETE audit/notification work in that race.
    if OLD.user_id is not null
       and not exists (select 1 from auth.users u where u.id = OLD.user_id)
    then
      return OLD;
    end if;

    v_request_id := OLD.id;
    v_old_status := coalesce(nullif(OLD.status, ''), 'unknown');
    v_new_status := 'deleted';
    insert into public.audit_logs (
      request_id, action, old_status, new_status, changed_by, changed_at
    )
    values (
      v_request_id, 'DELETE', v_old_status, v_new_status, v_changed_by, now()
    );
    return OLD;
  end if;

  return null;
end;
$_$;


ALTER FUNCTION "public"."log_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") RETURNS TABLE("id" "uuid", "voter_id" "text", "first_name" "text", "middle_name" "text", "last_name" "text", "suffix" "text", "birth_date" "date", "sex" "text", "barangay_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
  select
    rv.id,
    rv.voter_id,
    rv.first_name,
    rv.middle_name,
    rv.last_name,
    rv.suffix,
    rv.birth_date,
    rv.sex,
    rv.barangay_id
  from public.registered_voters rv
  where private.normalize_voter_id(rv.voter_id) = private.normalize_voter_id(p_voter_id)
  limit 1;
$$;


ALTER FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") IS 'Registration helper (SECURITY DEFINER): returns one registered_voters row for a voter_id using private.normalize_voter_id().';



CREATE OR REPLACE FUNCTION "public"."mark_all_super_admin_notifications_read"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  insert into public.super_admin_notification_read (notification_id, user_id)
  select n.id, p_user_id
  from public.super_admin_notification n
  where not exists (
    select 1
    from public.super_admin_notification_read r
    where r.notification_id = n.id
      and r.user_id = p_user_id
  )
  on conflict (notification_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."mark_all_super_admin_notifications_read"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_request_notifications_read"("p_request_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.user_notification un
  set
    is_read = true,
    updated_at = now()
  where un.user_id = auth.uid()
    and un.request_id = p_request_id
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."mark_request_notifications_read"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_request_notifications_read_for_user"("p_user_id" "uuid", "p_request_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  update public.user_notification un
  set
    is_read = true,
    updated_at = now()
  where un.user_id = p_user_id
    and un.request_id = p_request_id
    and un.is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."mark_request_notifications_read_for_user"("p_user_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_super_admin_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_user_id is null or p_notification_id is null then
    return false;
  end if;
  if not exists (
    select 1 from public.super_admin_notification n where n.id = p_notification_id
  ) then
    return false;
  end if;

  insert into public.super_admin_notification_read (notification_id, user_id)
  values (p_notification_id, p_user_id)
  on conflict (notification_id, user_id) do nothing;

  return true;
end;
$$;


ALTER FUNCTION "public"."mark_super_admin_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_admin_role"("p_role" "text", "p_service_type" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when lower(trim(coalesce(p_role, ''))) = 'super_admin' then 'super_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'medical' then 'medical_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'financial' then 'financial_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'burial' then 'burial_admin'
    else null
  end;
$$;


ALTER FUNCTION "public"."normalize_admin_role"("p_role" "text", "p_service_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_financial_requests_service_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.service_id := public.normalize_financial_service_id_value(new.service_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_financial_requests_service_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_financial_service_id_value"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case lower(trim(coalesce(p_value, '')))
    when '' then 'financial'
    when 'financial' then 'financial'
    when 'financials' then 'financial'
    when 'finance' then 'financial'
    when 'financial_request' then 'financial'
    when 'financial_requests' then 'financial'
    when 'financial_req' then 'financial'
    when 'financial_reqquest' then 'financial'
    when 'financial_reqquests' then 'financial'
    when 'financial-request' then 'financial'
    when 'financial requests' then 'financial'
    else lower(trim(coalesce(p_value, '')))
  end;
$$;


ALTER FUNCTION "public"."normalize_financial_service_id_value"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_request_table_name"("p_request_table" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case lower(trim(coalesce(p_request_table, '')))
    when 'financial_req' then 'financial_requests'
    when 'financial_request' then 'financial_requests'
    when 'financial_reqquests' then 'financial_requests'
    when 'financial_reqquest' then 'financial_requests'
    else lower(trim(coalesce(p_request_table, '')))
  end;
$$;


ALTER FUNCTION "public"."normalize_request_table_name"("p_request_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_admin_notifications"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
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


ALTER FUNCTION "public"."process_admin_notifications"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_admin_notifications"() IS 'Rebuilds admin_notification inbox. Terminal statuses (approved, declined) are excluded.';



CREATE OR REPLACE FUNCTION "public"."prune_admin_active_sessions"("p_ttl_seconds" integer DEFAULT 180) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 180), 1);
begin
  delete from public.admin_active_sessions
  where last_seen <= timezone('utc', now()) - make_interval(secs => v_ttl);
end;
$$;


ALTER FUNCTION "public"."prune_admin_active_sessions"("p_ttl_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'private'
    AS $$
declare
  v_email text;
  v_deleted boolean := false;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or p_attempt_token is null then
    return false;
  end if;

  if not exists (
    select 1
    from private.registration_attempts ra
    where ra.attempt_token = p_attempt_token
      and ra.email = v_email
      and ra.consumed_at is null
      and ra.expires_at > now()
  ) then
    return false;
  end if;

  delete from auth.users au
  where lower(trim(coalesce(au.email, ''))) = v_email
    and au.email_confirmed_at is null
    and not exists (
      select 1
      from public.users u
      where u.id = au.id
    );

  v_deleted := found;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") IS 'Deletes an unconfirmed Auth user with no profile so registration can restart with a new MPIN.';



CREATE OR REPLACE FUNCTION "public"."reject_unconfirmed_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = new.id
      and au.email_confirmed_at is not null
  ) then
    raise exception 'Email is not confirmed';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."reject_unconfirmed_user_profile"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reject_unconfirmed_user_profile"() IS 'Blocks public.users inserts until the matching auth.users email is confirmed.';



CREATE OR REPLACE FUNCTION "public"."release_admin_session"("p_user_id" "uuid", "p_session_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or v_session_id = '' then
    return false;
  end if;

  delete from public.admin_active_sessions
  where user_id = p_user_id
    and session_id = v_session_id;

  return found;
end;
$$;


ALTER FUNCTION "public"."release_admin_session"("p_user_id" "uuid", "p_session_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_admin_can_access_request_row"("p_status" "text", "p_category_id" "uuid", "p_service_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    nullif(trim(lower(coalesce(p_status, ''))), '') is distinct from 'draft'
    and (
      public.is_superadmin(auth.uid())
      or public.line_admin_matches_category(
        auth.uid(),
        coalesce(
          p_category_id,
          (
            select s.category_id
            from public.assistance_services s
            where s.id = p_service_id
          )
        )
      )
    );
$$;


ALTER FUNCTION "public"."rls_admin_can_access_request_row"("p_status" "text", "p_category_id" "uuid", "p_service_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rls_admin_can_access_request_row"("p_status" "text", "p_category_id" "uuid", "p_service_id" "uuid") IS 'RLS helper: superadmin or line admin of the request snapshot/live category. Bypasses catalog RLS.';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_can_select_assistance_category"("p_category_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_superadmin(auth.uid())
    or public.line_admin_matches_category(auth.uid(), p_category_id)
    or exists (
      select 1
      from public.assistance_requests r
      where r.user_id = auth.uid()
        and (
          r.category_id = p_category_id
          or exists (
            select 1
            from public.assistance_services s
            where s.id = r.service_id
              and s.category_id = p_category_id
          )
        )
    );
$$;


ALTER FUNCTION "public"."rls_can_select_assistance_category"("p_category_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rls_can_select_assistance_category"("p_category_id" "uuid") IS 'RLS helper: archived/inactive categories stay readable for superadmin, line admin, or the applicant with history on that line.';



CREATE OR REPLACE FUNCTION "public"."rls_can_select_assistance_requirement"("p_service_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.assistance_services s
      where s.id = p_service_id
        and public.line_admin_matches_category(auth.uid(), s.category_id)
    )
    or exists (
      select 1
      from public.assistance_requests r
      where r.service_id = p_service_id
        and r.user_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."rls_can_select_assistance_requirement"("p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_can_select_assistance_service"("p_service_id" "uuid", "p_category_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_superadmin(auth.uid())
    or public.line_admin_matches_category(auth.uid(), p_category_id)
    or exists (
      select 1
      from public.assistance_requests r
      where r.service_id = p_service_id
        and r.user_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."rls_can_select_assistance_service"("p_service_id" "uuid", "p_category_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rls_can_select_assistance_service"("p_service_id" "uuid", "p_category_id" "uuid") IS 'RLS helper: archived/inactive services stay readable for superadmin, line admin, or the applicant who already has a request.';



CREATE OR REPLACE FUNCTION "public"."rls_can_select_requirement_tip"("p_requirement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.assistance_requirements r
    where r.id = p_requirement_id
      and public.rls_can_select_assistance_requirement(r.service_id)
  );
$$;


ALTER FUNCTION "public"."rls_can_select_requirement_tip"("p_requirement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_requirement_is_on_active_service"("p_requirement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.assistance_requirements r
    join public.assistance_services s on s.id = r.service_id
    where r.id = p_requirement_id
      and s.active is true
  );
$$;


ALTER FUNCTION "public"."rls_requirement_is_on_active_service"("p_requirement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_service_is_active"("p_service_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.assistance_services s
    where s.id = p_service_id
      and s.active is true
  );
$$;


ALTER FUNCTION "public"."rls_service_is_active"("p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_active_sessions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_admin_active_sessions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_burial_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_burial_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_burial_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_columbarium_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_columbarium_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_columbarium_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cremation_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_cremation_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_cremation_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_financial_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_financial_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_financial_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_financial_request_user_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_financial_request_user_id_default"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_hospitalization_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_hospitalization_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_hospitalization_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_medical_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_medical_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_medical_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_monetary_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_monetary_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_monetary_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_registered_voters_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_registered_voters_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_treatment_request_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if lower(coalesce(old.status, '')) = 'draft'
     and lower(coalesce(new.status, '')) = 'pending'
     and new.request_code is null then
    new.request_code := public.generate_treatment_request_code(coalesce(new.submitted_at, now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_treatment_request_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stamp_assistance_request_catalog_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."stamp_assistance_request_catalog_snapshot"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."stamp_assistance_request_catalog_snapshot"() IS 'Stamps request catalog snapshots on insert or service_id change. Renames never rewrite existing snapshots.';



CREATE OR REPLACE FUNCTION "public"."submit_assistance_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_service_id uuid;
  v_user_id uuid;
  v_missing text[];
  v_code_token text;
begin
  select r.service_id, r.user_id
    into v_service_id, v_user_id
  from public.assistance_requests r
  where r.id = p_request_id;

  if v_service_id is null then
    raise exception 'request_not_found';
  end if;

  if v_user_id <> auth.uid() and not public.is_superadmin(auth.uid()) then
    raise exception 'not_allowed';
  end if;

  select coalesce(
    nullif(trim(s.request_code_token), ''),
    lower(replace(s.id::text, '-', ''))
  )
    into v_code_token
  from public.assistance_services s
  where s.id = v_service_id;

  select array_agg(req.slot_key order by req.sort_order)
    into v_missing
  from public.assistance_services s
  join public.assistance_requirements req on req.service_id = s.id
  where s.id = v_service_id
    and not private.is_optional_attachment_requirement(req.slot_key, req.required)
    and not exists (
      select 1
      from public.request_attachments a
      where a.assistance_request_id = p_request_id
        and a.file_type in (
          coalesce(
            nullif(trim(s.attachment_slot_map ->> req.slot_key), ''),
            req.slot_key
          ),
          req.slot_key
        )
        and nullif(trim(a.path), '') is not null
    );

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception 'missing_required_attachments: %', array_to_string(v_missing, ',');
  end if;

  update public.assistance_requests r
  set
    status = 'pending',
    submitted_at = now(),
    request_code = coalesce(
      r.request_code,
      public.generate_request_code_for_service(v_code_token, now())
    )
  where r.id = p_request_id;
end;
$$;


ALTER FUNCTION "public"."submit_assistance_request"("p_request_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."submit_assistance_request"("p_request_id" "uuid") IS 'Pending when required slots are uploaded; uses assistance_request_id only (no request_table).';



CREATE OR REPLACE FUNCTION "public"."superadmin_list_admins"() RETURNS TABLE("user_id" "uuid", "email" "text", "is_super_admin" boolean, "category_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select
    a.user_id,
    u.email::text as email,
    a.is_super_admin,
    a.category_id,
    a.created_at
  from public.admins a
  left join auth.users u on u.id = a.user_id
  where public.is_superadmin(auth.uid())
  order by a.is_super_admin desc, a.created_at asc;
$$;


ALTER FUNCTION "public"."superadmin_list_admins"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."superadmin_list_admins"() IS 'Superadmin-only admin directory: returns each admin row with auth email. Empty set for non-superadmins.';



CREATE OR REPLACE FUNCTION "public"."tg_settings_stamp_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    if new.created_at is null then
      new.created_at := now();
    end if;
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_settings_stamp_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_web_content_stamp_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if new.updated_by is null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_web_content_stamp_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_admin_session"("p_user_id" "uuid", "p_session_id" "text", "p_ttl_seconds" integer DEFAULT 180) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := timezone('utc', now());
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or v_session_id = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  update public.admin_active_sessions
  set last_seen = v_now,
      updated_at = v_now
  where user_id = p_user_id
    and session_id = v_session_id;

  return found;
end;
$$;


ALTER FUNCTION "public"."touch_admin_session"("p_user_id" "uuid", "p_session_id" "text", "p_ttl_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_assistance_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_assistance_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_admin_notification_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_admin_notification_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_request_attachments_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_request_attachments_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_notification_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_user_notification_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user_push_token"("p_token" "text", "p_platform" "text" DEFAULT NULL::"text", "p_device_id" "text" DEFAULT NULL::"text", "p_enabled" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'upsert_user_push_token requires an authenticated caller'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception 'push token is required'
      using errcode = '22023';
  end if;

  insert into public.user_push_token (user_id, token, platform, device_id, enabled)
  values (v_uid, p_token, p_platform, p_device_id, coalesce(p_enabled, true))
  on conflict (user_id, token) do update
  set
    platform = excluded.platform,
    device_id = excluded.device_id,
    enabled = excluded.enabled,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."upsert_user_push_token"("p_token" "text", "p_platform" "text", "p_device_id" "text", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_registration_attempt_token"("p_token" "uuid", "p_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return false;
  end if;

  return exists (
    select 1
    from private.registration_attempts
    where attempt_token = p_token
      and email = v_email
      and expires_at > now()
      and consumed_at is null
  );
end;
$$;


ALTER FUNCTION "public"."validate_registration_attempt_token"("p_token" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_first text;
  v_middle text;
  v_last text;
  v_suffix text;
  v_sex char(1);
  v_birth date;
  v_voter_id text;
  v_match_count int;
  v_registered_voter_id uuid;
  v_mismatch_msg constant text :=
    'We could not find your information in the Dasmariñas City registered voter list. Please review your details and try again, or visit your barangay office if you believe this is an error.';
begin
  v_first := private.normalize_registration_name(p_first_name);
  v_middle := private.normalize_registration_name(p_middle_name);
  v_last := private.normalize_registration_name(p_last_name);
  v_suffix := private.normalize_registration_name(p_suffix);
  v_voter_id := private.normalize_voter_id(p_voter_id_number);

  if v_first = '' or v_last = '' then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please enter your first and last name as they appear on your voter registration.'
    );
  end if;

  if p_barangay_id is null then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please select your barangay.'
    );
  end if;

  v_sex := upper(trim(coalesce(p_sex, '')))::char(1);
  if v_sex is null or v_sex not in ('M', 'F') then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please select your sex as it appears on your voter registration.'
    );
  end if;

  begin
    v_birth := nullif(trim(coalesce(p_birth_date, '')), '')::date;
  exception
    when others then
      return jsonb_build_object(
        'matched', false,
        'message', 'Please enter a valid birth date.'
      );
  end;

  if v_birth is null then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please enter your birth date as it appears on your voter registration.'
    );
  end if;

  if v_birth > current_date then
    return jsonb_build_object(
      'matched', false,
      'message', 'Birth date cannot be in the future.'
    );
  end if;

  if v_voter_id = '' then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please enter your Voter''s ID Number as it appears on your voter registration.'
    );
  end if;

  select count(*)::int
    into v_match_count
  from public.registered_voters rv
  where private.normalize_registration_name(rv.first_name) = v_first
    and private.normalize_registration_name(rv.middle_name) = v_middle
    and private.normalize_registration_name(rv.last_name) = v_last
    and private.normalize_registration_name(rv.suffix) = v_suffix
    and rv.birth_date = v_birth
    and rv.sex = v_sex
    and rv.barangay_id = p_barangay_id
    and private.normalize_voter_id(rv.voter_id) = v_voter_id;

  if v_match_count <> 1 then
    return jsonb_build_object('matched', false, 'message', v_mismatch_msg);
  end if;

  select rv.id
    into v_registered_voter_id
  from public.registered_voters rv
  where private.normalize_registration_name(rv.first_name) = v_first
    and private.normalize_registration_name(rv.middle_name) = v_middle
    and private.normalize_registration_name(rv.last_name) = v_last
    and private.normalize_registration_name(rv.suffix) = v_suffix
    and rv.birth_date = v_birth
    and rv.sex = v_sex
    and rv.barangay_id = p_barangay_id
    and private.normalize_voter_id(rv.voter_id) = v_voter_id
  limit 1;

  if exists (
    select 1
    from public.users u
    where u.registered_voter_id = v_registered_voter_id
  ) then
    return jsonb_build_object('matched', false, 'message', v_mismatch_msg);
  end if;

  return jsonb_build_object(
    'matched', true,
    'registered_voter_id', v_registered_voter_id
  );
end;
$$;


ALTER FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text") IS 'Step-0 registry cross-match: name, birth date, sex, barangay, and voter ID must all match.';



CREATE OR REPLACE FUNCTION "public"."verify_voter_id_for_registration"("p_registered_voter_id" "uuid", "p_voter_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_rv public.registered_voters%rowtype;
  v_mismatch_msg constant text :=
    'We could not find your information in the Dasmariñas City registered voter list. Please review your details and try again, or visit your barangay office if you believe this is an error.';
begin
  if p_registered_voter_id is null then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please complete voter verification on the first step.'
    );
  end if;

  if private.normalize_voter_id(p_voter_id) = '' then
    return jsonb_build_object(
      'matched', false,
      'message', 'Please enter your Voter''s ID Number as it appears on your voter registration.'
    );
  end if;

  select *
    into v_rv
  from public.registered_voters rv
  where rv.id = p_registered_voter_id;

  if not found then
    return jsonb_build_object('matched', false, 'message', v_mismatch_msg);
  end if;

  if private.normalize_voter_id(v_rv.voter_id) <> private.normalize_voter_id(p_voter_id) then
    return jsonb_build_object('matched', false, 'message', v_mismatch_msg);
  end if;

  return jsonb_build_object('matched', true);
end;
$$;


ALTER FUNCTION "public"."verify_voter_id_for_registration"("p_registered_voter_id" "uuid", "p_voter_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_active_sessions" (
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "email" "text",
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_active_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notification" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "audit_log_id" "uuid" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assistance_request_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."admin_notification" REPLICA IDENTITY FULL;


ALTER TABLE "public"."admin_notification" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_notification" IS 'Line-admin inbox: at most one row per (admin_user_id, assistance_request_id); audit_log_id is the latest applicant movement for that request. Updated by process_admin_notifications().';



CREATE TABLE IF NOT EXISTS "public"."admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_id" "uuid",
    "is_super_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "admins_superadmin_scope_chk" CHECK (((NOT "is_super_admin") OR ("category_id" IS NULL)))
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


COMMENT ON COLUMN "public"."admins"."category_id" IS 'Line-admin scope FK to assistance_categories.id. Null for super admins.';



COMMENT ON COLUMN "public"."admins"."is_super_admin" IS 'Admin privilege flag. true = superadmin access, false = line-admin access constrained by category_id.';



CREATE SEQUENCE IF NOT EXISTS "public"."assistance_catalog_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."assistance_catalog_request_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assistance_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "assistance_name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "theme_json" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."assistance_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistance_categories" IS 'CMS top-level assistance groupings (Medical / Financial / Burial). MODULAR_PLATFORM_PLAN P0.';



COMMENT ON COLUMN "public"."assistance_categories"."assistance_name" IS 'Short category name from CMS (e.g. Medical). Mobile app appends " Assistance" for long titles.';



COMMENT ON COLUMN "public"."assistance_categories"."active" IS 'Live catalog flag. false hides the row from new picks (mobile home / CMS lists). Historical requests, logs, and notifications keep using the row and their snapshots.';



COMMENT ON COLUMN "public"."assistance_categories"."theme_json" IS 'Admin UI palette: primary, secondary, tertiary, accent, ring (hex strings).';



COMMENT ON COLUMN "public"."assistance_categories"."description" IS 'Optional CMS copy for the assistance category. Reserved for future mobile/admin use.';



CREATE TABLE IF NOT EXISTS "public"."assistance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "request_code" "text",
    "submitted_at" timestamp with time zone,
    "case_study_date" timestamp with time zone,
    "additional_info" "text",
    "financial_request_type" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload_version" smallint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "category_slug" "text" DEFAULT ''::"text" NOT NULL,
    "service_name" "text" DEFAULT ''::"text" NOT NULL,
    "assistance_name" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."assistance_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistance_requests" IS 'Canonical per-user assistance applications; supersedes eight *_requests legacy tables.';



COMMENT ON COLUMN "public"."assistance_requests"."user_id" IS 'Owning Auth user. Null after the account is deleted; request payload/attachments/audit are retained.';



COMMENT ON COLUMN "public"."assistance_requests"."category_id" IS 'Assistance line captured when the request row was written. Catalog moves do not overwrite this.';



COMMENT ON COLUMN "public"."assistance_requests"."category_slug" IS 'Category slug captured when the request row was written. Used for historical theming.';



COMMENT ON COLUMN "public"."assistance_requests"."service_name" IS 'Service display name captured when the request row was written. Catalog renames do not overwrite this.';



COMMENT ON COLUMN "public"."assistance_requests"."assistance_name" IS 'Assistance line name captured when the request row was written. Catalog renames do not overwrite this.';



CREATE TABLE IF NOT EXISTS "public"."assistance_requirement_tips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requirement_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assistance_requirement_tips" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistance_requirement_tips" IS 'Tip bullets shown under each requirement in ContentManagement / future mobile UI.';



CREATE TABLE IF NOT EXISTS "public"."assistance_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "title" "text" NOT NULL,
    "slot_key" "text" NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "help" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assistance_requirements" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistance_requirements" IS 'Attachment/document requirements per service; slot_key aligns with request_attachments mechanics.';



COMMENT ON COLUMN "public"."assistance_requirements"."help" IS 'Optional plain-text helper note shown to applicants for this requirement.';



CREATE TABLE IF NOT EXISTS "public"."assistance_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "description_html" "text" DEFAULT ''::"text" NOT NULL,
    "mobile_image_url" "text",
    "reminder_text" "text" DEFAULT ''::"text" NOT NULL,
    "web_intro_html" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "has_details_step" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "about_html" "text" DEFAULT ''::"text" NOT NULL,
    "who_bullets" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "radio_selection" "jsonb",
    "attachment_slot_map" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "request_code_token" "text",
    "cms_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "request_code" "text"
);


ALTER TABLE "public"."assistance_services" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistance_services" IS 'CMS service definitions keyed by service_key (matches mobile ServiceId).';



COMMENT ON COLUMN "public"."assistance_services"."active" IS 'Live catalog flag. false hides the row from new picks (mobile home / CMS lists). Historical requests, logs, and notifications keep using the row and their snapshots.';



COMMENT ON COLUMN "public"."assistance_services"."about_html" IS 'Rich “About service” body on mobile detail modal; falls back to description_html when blank.';



COMMENT ON COLUMN "public"."assistance_services"."who_bullets" IS 'JSON array of strings for “Who may avail”; empty means hide section on mobile.';



COMMENT ON COLUMN "public"."assistance_services"."radio_selection" IS 'Mobile preflight radio steps JSON: { "version": 1, "reminder_html"?: string, "steps": [{ "id", "prompt", "options": [{ "value", "label" }] }] }.';



COMMENT ON COLUMN "public"."assistance_services"."attachment_slot_map" IS 'JSON object: UI slot_key → DB file_type string (e.g. letter → letter_file).';



COMMENT ON COLUMN "public"."assistance_services"."cms_metadata" IS 'Admin CMS-only metadata (JSON). Keys: descriptionFontFamily, reminderFontFamily, sampleDocumentImage, sampleDocumentName, webHeroImage, webMapLink, webOfficeTitle. Mobile app ignores this column.';



COMMENT ON COLUMN "public"."assistance_services"."request_code" IS 'Configurable prefix (letters/digits, up to 6). Full request_code assigned on submit via generate_catalog_request_code.';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "old_status" "text",
    "new_status" "text",
    CONSTRAINT "audit_logs_action_check" CHECK (("action" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"]))),
    CONSTRAINT "audit_logs_event_shape_chk" CHECK (((("action" = 'INSERT'::"text") AND ("request_id" IS NOT NULL) AND ("new_status" IS NOT NULL)) OR (("action" = 'UPDATE'::"text") AND ("request_id" IS NOT NULL) AND ("new_status" IS NOT NULL) AND ("old_status" IS DISTINCT FROM "new_status")) OR (("action" = 'DELETE'::"text") AND ("request_id" IS NOT NULL) AND ("old_status" IS NOT NULL) AND ("new_status" = 'deleted'::"text"))))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_trail" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "actor_email" "text",
    "action" "text" NOT NULL,
    "module" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "text",
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "text",
    "country_code" "text",
    "user_agent" "text",
    CONSTRAINT "audit_trail_action_len" CHECK ((("char_length"("action") >= 1) AND ("char_length"("action") <= 64))),
    CONSTRAINT "audit_trail_module_len" CHECK ((("char_length"("module") >= 1) AND ("char_length"("module") <= 64))),
    CONSTRAINT "audit_trail_summary_len" CHECK ((("char_length"("summary") >= 1) AND ("char_length"("summary") <= 500)))
);


ALTER TABLE "public"."audit_trail" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_trail" IS 'Superadmin CMS activity log for mutations, exports, and sessions.';



CREATE TABLE IF NOT EXISTS "public"."barangays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."barangays" OWNER TO "postgres";


COMMENT ON TABLE "public"."barangays" IS 'Official barangay catalog for new selections. Superadmin may rename or delete rows. Person records keep their own barangay snapshot and are never cascaded.';



COMMENT ON COLUMN "public"."barangays"."is_active" IS 'When false the barangay is retired from new picks. Existing voter/user records are left unchanged.';



CREATE SEQUENCE IF NOT EXISTS "public"."burial_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."burial_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."columbarium_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."columbarium_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cremation_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cremation_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."financial_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."financial_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."hospitalization_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."hospitalization_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."medical_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."medical_request_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."monetary_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."monetary_request_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registered_voters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text" DEFAULT ''::"text" NOT NULL,
    "last_name" "text" NOT NULL,
    "suffix" "text" DEFAULT ''::"text" NOT NULL,
    "age" smallint NOT NULL,
    "sex" character(1) NOT NULL,
    "birth_date" "date" NOT NULL,
    "voter_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "barangay_id" "uuid",
    "barangay_name" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "registered_voters_age_chk" CHECK ((("age" >= 1) AND ("age" <= 120))),
    CONSTRAINT "registered_voters_sex_chk" CHECK (("sex" = ANY (ARRAY['M'::"bpchar", 'F'::"bpchar"]))),
    CONSTRAINT "registered_voters_voter_id_format_chk" CHECK (("voter_id" ~ '^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$'::"text"))
);


ALTER TABLE "public"."registered_voters" OWNER TO "postgres";


COMMENT ON TABLE "public"."registered_voters" IS 'Voter registry for superadmin data management; RLS restricted to admins.role = super_admin.';



COMMENT ON COLUMN "public"."registered_voters"."barangay_id" IS 'Live catalog pointer when the barangay still exists. Null after catalog removal; barangay_name remains the historical snapshot.';



COMMENT ON COLUMN "public"."registered_voters"."barangay_name" IS 'Name captured when the voter record was written. Survives catalog rename and catalog deletion.';



CREATE TABLE IF NOT EXISTS "public"."request_attachments" (
    "uid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_type" "text" NOT NULL,
    "path" "text" NOT NULL,
    "status" "text" DEFAULT 'in progress'::"text" NOT NULL,
    "created" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason_for_action" "text",
    "additional_reason" character varying(500),
    "assistance_request_id" "uuid" NOT NULL,
    CONSTRAINT "request_attachments_path_chk" CHECK (("btrim"("path") <> ''::"text")),
    CONSTRAINT "request_attachments_path_object_path_check" CHECK ((("path" IS NULL) OR (("btrim"("path") <> ''::"text") AND ("path" !~* '^https?://'::"text") AND ("path" !~* '^/?storage/v1/object/'::"text") AND ("path" !~* '^request-documents/'::"text") AND ("path" !~* '^(hospitalization-documents|treatment-documents|medical-documents|financial-documents|monetary-documents|burial-documents|cremation-documents|columbarium-documents)/'::"text")))),
    CONSTRAINT "request_attachments_reason_for_action_check" CHECK ((("reason_for_action" IS NULL) OR ("reason_for_action" = ANY (ARRAY['Blurry'::"text", 'Tampered/Photoshopped'::"text", 'Expired'::"text", 'Name Mismatch'::"text", 'Wrong document'::"text"])))),
    CONSTRAINT "request_attachments_status_chk" CHECK (("status" = ANY (ARRAY['in progress'::"text", 'approved'::"text", 'action_required'::"text", 'resubmitted'::"text"])))
);


ALTER TABLE "public"."request_attachments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."request_attachments"."assistance_request_id" IS 'Canonical parent request reference for attachment ownership, access checks, and lifecycle sync.';



CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "visibility" "text" DEFAULT 'authenticated'::"text" NOT NULL,
    "is_secret" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "settings_scope_check" CHECK (("scope" = ANY (ARRAY['system'::"text", 'admin'::"text", 'user'::"text"]))),
    CONSTRAINT "settings_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'authenticated'::"text", 'admin'::"text", 'superadmin'::"text"])))
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."settings" IS 'Unified platform settings store. scope = system|admin|user; key = settings group id; value = jsonb config blob.';



COMMENT ON COLUMN "public"."settings"."scope" IS 'Logical settings surface: system, admin, or user.';



COMMENT ON COLUMN "public"."settings"."key" IS 'Settings group id (mirrors UI tab id).';



COMMENT ON COLUMN "public"."settings"."value" IS 'Arbitrary JSON configuration for the group.';



COMMENT ON COLUMN "public"."settings"."visibility" IS 'Read ACL hint: public|authenticated|admin|superadmin.';



COMMENT ON COLUMN "public"."settings"."is_secret" IS 'When true, readable only by superadmins.';



COMMENT ON COLUMN "public"."settings"."version" IS 'Optimistic concurrency counter; bumped on each update.';



COMMENT ON COLUMN "public"."settings"."metadata" IS 'Extensible non-value metadata (labels, UI hints, schema notes).';



CREATE TABLE IF NOT EXISTS "public"."super_admin_notification" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "uuid",
    "event_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "request_code" "text",
    "applicant_name" "text",
    "applicant_user_id" "uuid",
    "service_name" "text",
    "assistance_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "super_admin_notification_body_len" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 500))),
    CONSTRAINT "super_admin_notification_event_type_check" CHECK (("event_type" = ANY (ARRAY['submitted'::"text", 'approved'::"text", 'declined'::"text"]))),
    CONSTRAINT "super_admin_notification_title_len" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 180)))
);

ALTER TABLE ONLY "public"."super_admin_notification" REPLICA IDENTITY FULL;


ALTER TABLE "public"."super_admin_notification" OWNER TO "postgres";


COMMENT ON TABLE "public"."super_admin_notification" IS 'Superadmin inbox events for request submit and scheduling approve/decline.';



CREATE TABLE IF NOT EXISTS "public"."super_admin_notification_read" (
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."super_admin_notification_read" REPLICA IDENTITY FULL;


ALTER TABLE "public"."super_admin_notification_read" OWNER TO "postgres";


COMMENT ON TABLE "public"."super_admin_notification_read" IS 'Per-superadmin read receipts for super_admin_notification rows.';



CREATE SEQUENCE IF NOT EXISTS "public"."treatment_request_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."treatment_request_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notification" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "audit_log_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "action" "text",
    "old_status" "text",
    "new_status" "text"
);

ALTER TABLE ONLY "public"."user_notification" REPLICA IDENTITY FULL;


ALTER TABLE "public"."user_notification" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_push_token" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "device_id" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_push_token" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text"),
    "first_name" character varying NOT NULL,
    "middle_name" character varying,
    "last_name" character varying NOT NULL,
    "contact_number" character varying NOT NULL,
    "email" character varying NOT NULL,
    "address" "text",
    "birth_date" "date",
    "sex" character(1),
    "suffix" character varying(10),
    "avatar_url" "text",
    "voter_id_number" "text",
    "registered_voter_id" "uuid",
    "barangay" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "users_sex_check" CHECK (("sex" = ANY (ARRAY['M'::"bpchar", 'F'::"bpchar"]))),
    CONSTRAINT "users_voter_id_number_format_chk" CHECK ((("voter_id_number" IS NULL) OR ("voter_id_number" ~ '^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$'::"text")))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Applicant profiles. RLS: owner read/write own row; line admins read caseload; superadmins read all. Deletes and privileged updates use service role.';



COMMENT ON COLUMN "public"."users"."registered_voter_id" IS 'FK to the Dasmariñas registered voter row verified at signup. At most one Apoyo account per voter.';



COMMENT ON COLUMN "public"."users"."barangay" IS 'Applicant profile barangay name snapshot. Independent of registered_voters.barangay_name and of the barangays catalog.';



COMMENT ON CONSTRAINT "users_voter_id_number_format_chk" ON "public"."users" IS 'Same 4-5-13-1 format as public.registered_voters.voter_id (registered_voters_voter_id_format_chk).';



CREATE TABLE IF NOT EXISTS "public"."web_content" (
    "page" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."web_content" OWNER TO "postgres";


COMMENT ON TABLE "public"."web_content" IS 'Public website content store. Read/write only via the `web` edge function (service role). One row per page.';



ALTER TABLE ONLY "public"."admin_active_sessions"
    ADD CONSTRAINT "admin_active_sessions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."admin_notification"
    ADD CONSTRAINT "admin_notification_admin_request_uidx" UNIQUE ("admin_user_id", "assistance_request_id");



ALTER TABLE ONLY "public"."admin_notification"
    ADD CONSTRAINT "admin_notification_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."assistance_categories"
    ADD CONSTRAINT "assistance_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistance_categories"
    ADD CONSTRAINT "assistance_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."assistance_requests"
    ADD CONSTRAINT "assistance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistance_requirement_tips"
    ADD CONSTRAINT "assistance_requirement_tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistance_requirements"
    ADD CONSTRAINT "assistance_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assistance_requirements"
    ADD CONSTRAINT "assistance_requirements_service_id_slot_key_key" UNIQUE ("service_id", "slot_key");



ALTER TABLE ONLY "public"."assistance_services"
    ADD CONSTRAINT "assistance_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_single_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_trail"
    ADD CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barangays"
    ADD CONSTRAINT "barangays_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."barangays"
    ADD CONSTRAINT "barangays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notification"
    ADD CONSTRAINT "notifications_audit_log_id_key" UNIQUE ("audit_log_id");



ALTER TABLE ONLY "public"."user_notification"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registered_voters"
    ADD CONSTRAINT "registered_voters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registered_voters"
    ADD CONSTRAINT "registered_voters_voter_id_key" UNIQUE ("voter_id");



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("uid");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_scope_key_unique" UNIQUE ("scope", "key");



ALTER TABLE ONLY "public"."super_admin_notification"
    ADD CONSTRAINT "super_admin_notification_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admin_notification_read"
    ADD CONSTRAINT "super_admin_notification_read_pkey" PRIMARY KEY ("notification_id", "user_id");



ALTER TABLE ONLY "public"."user_notification"
    ADD CONSTRAINT "user_notification_user_request_key" UNIQUE ("user_id", "request_id");



ALTER TABLE ONLY "public"."user_push_token"
    ADD CONSTRAINT "user_push_token_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_push_token"
    ADD CONSTRAINT "user_push_token_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."web_content"
    ADD CONSTRAINT "web_content_pkey" PRIMARY KEY ("page");



CREATE UNIQUE INDEX "admin_active_sessions_email_key" ON "public"."admin_active_sessions" USING "btree" ("email");



CREATE INDEX "admin_active_sessions_last_seen_idx" ON "public"."admin_active_sessions" USING "btree" ("last_seen");



CREATE INDEX "admin_notification_admin_user_id_idx" ON "public"."admin_notification" USING "btree" ("admin_user_id");



CREATE INDEX "admin_notification_assistance_request_id_idx" ON "public"."admin_notification" USING "btree" ("assistance_request_id");



CREATE INDEX "admin_notification_audit_log_id_idx" ON "public"."admin_notification" USING "btree" ("audit_log_id");



CREATE INDEX "admin_notification_unread_idx" ON "public"."admin_notification" USING "btree" ("admin_user_id") WHERE ("is_read" = false);



CREATE INDEX "admins_category_id_idx" ON "public"."admins" USING "btree" ("category_id");



CREATE INDEX "assistance_requests_approved_submitted_idx" ON "public"."assistance_requests" USING "btree" ("service_id", "submitted_at" DESC NULLS LAST) WHERE ("status" = 'approved'::"text");



CREATE INDEX "assistance_requests_archive_submitted_idx" ON "public"."assistance_requests" USING "btree" ("service_id", "submitted_at" DESC NULLS LAST) WHERE ("status" = ANY (ARRAY['approved'::"text", 'declined'::"text"]));



CREATE INDEX "assistance_requests_category_id_idx" ON "public"."assistance_requests" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);



CREATE INDEX "assistance_requests_request_code_lower_idx" ON "public"."assistance_requests" USING "btree" ("lower"("request_code"));



CREATE UNIQUE INDEX "assistance_requests_request_code_uq" ON "public"."assistance_requests" USING "btree" ("request_code") WHERE ("request_code" IS NOT NULL);



CREATE INDEX "assistance_requests_service_status_idx" ON "public"."assistance_requests" USING "btree" ("service_id", "status");



CREATE INDEX "assistance_requests_user_updated_idx" ON "public"."assistance_requests" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "assistance_requirement_tips_requirement_id_idx" ON "public"."assistance_requirement_tips" USING "btree" ("requirement_id");



CREATE INDEX "assistance_requirements_service_id_idx" ON "public"."assistance_requirements" USING "btree" ("service_id");



CREATE INDEX "assistance_services_category_id_idx" ON "public"."assistance_services" USING "btree" ("category_id");



CREATE INDEX "audit_trail_action_created_at_idx" ON "public"."audit_trail" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "audit_trail_actor_created_at_idx" ON "public"."audit_trail" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "audit_trail_created_at_idx" ON "public"."audit_trail" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_trail_module_created_at_idx" ON "public"."audit_trail" USING "btree" ("module", "created_at" DESC);



CREATE UNIQUE INDEX "barangays_name_lower_uidx" ON "public"."barangays" USING "btree" ("lower"("name"));



CREATE INDEX "idx_admin_active_sessions_email" ON "public"."admin_active_sessions" USING "btree" ("email");



CREATE INDEX "idx_admin_active_sessions_last_seen" ON "public"."admin_active_sessions" USING "btree" ("last_seen");



CREATE INDEX "idx_assistance_categories_active_sort" ON "public"."assistance_categories" USING "btree" ("active", "sort_order");



CREATE INDEX "idx_assistance_requirement_tips_requirement_sort" ON "public"."assistance_requirement_tips" USING "btree" ("requirement_id", "sort_order");



CREATE INDEX "idx_assistance_requirements_service_sort" ON "public"."assistance_requirements" USING "btree" ("service_id", "sort_order");



CREATE INDEX "idx_assistance_services_category_active_sort" ON "public"."assistance_services" USING "btree" ("category_id", "active", "sort_order");



CREATE INDEX "idx_audit_logs_actor_time" ON "public"."audit_logs" USING "btree" ("changed_by", "changed_at" DESC);



CREATE INDEX "idx_audit_logs_changed_at_desc" ON "public"."audit_logs" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_audit_logs_new_status" ON "public"."audit_logs" USING "btree" ("new_status", "changed_at" DESC);



CREATE INDEX "registered_voters_barangay_id_idx" ON "public"."registered_voters" USING "btree" ("barangay_id");



CREATE INDEX "registered_voters_birth_date_idx" ON "public"."registered_voters" USING "btree" ("birth_date" DESC);



CREATE INDEX "registered_voters_last_name_idx" ON "public"."registered_voters" USING "btree" ("last_name");



CREATE UNIQUE INDEX "request_attachments_assistance_file_uidx" ON "public"."request_attachments" USING "btree" ("assistance_request_id", "file_type");



CREATE INDEX "request_attachments_path_idx" ON "public"."request_attachments" USING "btree" ("path");



CREATE INDEX "request_attachments_status_idx" ON "public"."request_attachments" USING "btree" ("status");



CREATE INDEX "settings_scope_active_idx" ON "public"."settings" USING "btree" ("scope", "is_active");



CREATE INDEX "settings_scope_idx" ON "public"."settings" USING "btree" ("scope");



CREATE INDEX "settings_visibility_idx" ON "public"."settings" USING "btree" ("visibility");



CREATE INDEX "super_admin_notification_created_at_idx" ON "public"."super_admin_notification" USING "btree" ("created_at" DESC);



CREATE INDEX "super_admin_notification_event_created_at_idx" ON "public"."super_admin_notification" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "super_admin_notification_read_user_idx" ON "public"."super_admin_notification_read" USING "btree" ("user_id", "read_at" DESC);



CREATE INDEX "super_admin_notification_request_id_idx" ON "public"."super_admin_notification" USING "btree" ("request_id");



CREATE INDEX "user_notification_created_idx" ON "public"."user_notification" USING "btree" ("created_at" DESC);



CREATE INDEX "user_notification_is_read_idx" ON "public"."user_notification" USING "btree" ("is_read", "created_at" DESC);



CREATE INDEX "user_notification_request_id_idx" ON "public"."user_notification" USING "btree" ("request_id");



CREATE INDEX "user_notification_user_id_idx" ON "public"."user_notification" USING "btree" ("user_id");



CREATE INDEX "user_notification_user_unread_idx" ON "public"."user_notification" USING "btree" ("user_id") WHERE ("is_read" = false);



CREATE INDEX "user_push_token_enabled_idx" ON "public"."user_push_token" USING "btree" ("user_id") WHERE ("enabled" = true);



CREATE INDEX "user_push_token_user_id_idx" ON "public"."user_push_token" USING "btree" ("user_id");



CREATE UNIQUE INDEX "users_registered_voter_id_unique" ON "public"."users" USING "btree" ("registered_voter_id") WHERE ("registered_voter_id" IS NOT NULL);




-- Private schema (functions/tables used by public triggers)
CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_assistance_category_id"("p_admin_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when a.is_super_admin then null
    else a.category_id
  end
  from public.admins a
  where a.user_id = p_admin_user_id
  limit 1;
$$;


ALTER FUNCTION "private"."admin_assistance_category_id"("p_admin_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."admin_notification_request_status"("p_request_table" "text", "p_request_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $_$
declare
  v_status text;
begin
  if coalesce(trim(p_request_table), '') = '' or p_request_id is null then
    return null;
  end if;

  begin
    execute format('select status::text from public.%I where id = $1 limit 1', p_request_table)
      into v_status
      using p_request_id;
  exception
    when undefined_table or undefined_column then
      return null;
  end;

  return v_status;
end;
$_$;


ALTER FUNCTION "private"."admin_notification_request_status"("p_request_table" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."applicant_display_name"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select nullif(
    trim(
      concat_ws(
        ' ',
        nullif(trim(u.first_name), ''),
        nullif(trim(u.middle_name), ''),
        nullif(trim(u.last_name), ''),
        nullif(trim(u.suffix), '')
      )
    ),
    ''
  )
  from public.users u
  where u.id = p_user_id
  limit 1;
$$;


ALTER FUNCTION "private"."applicant_display_name"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."assistance_category_id_for_request"("p_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    r.category_id,
    s.category_id
  )
  from public.assistance_requests r
  left join public.assistance_services s on s.id = r.service_id
  where r.id = p_request_id
  limit 1;
$$;


ALTER FUNCTION "private"."assistance_category_id_for_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."audit_log_request_exists"("p_request_table" "text", "p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.assistance_requests r where r.id = p_request_id
  );
$$;


ALTER FUNCTION "private"."audit_log_request_exists"("p_request_table" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."audit_log_service_type"("p_request_table" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "private"."audit_log_service_type"("p_request_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."bucket_for_request_table"("p_request_table" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_request_table in (
      'assistance_requests',
      'hospitalization_requests',
      'treatment_requests',
      'medical_requests',
      'financial_requests',
      'monetary_requests',
      'burial_requests',
      'cremation_requests',
      'columbarium_requests'
    ) then 'request-documents'
    else null
  end;
$$;


ALTER FUNCTION "private"."bucket_for_request_table"("p_request_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."can_access_user_notification"("p_audit_log_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.audit_logs al
      where al.id = p_audit_log_id
        and al.request_id is not null
        and private.user_notification_request_owner(
          'assistance_requests',
          al.request_id
        ) = auth.uid()
    )
  end;
$$;


ALTER FUNCTION "private"."can_access_user_notification"("p_audit_log_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."clear_request_attachment_uid_reference"("p_request_id" "uuid", "p_file_type" "text", "p_attachment_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_column_exists boolean;
begin
  if p_request_id is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'assistance_requests'
      and c.column_name = p_file_type
  ) into v_column_exists;

  if not v_column_exists then
    return;
  end if;

  execute format(
    'update public.assistance_requests set %I = null where id = %L::uuid and %I = %L',
    p_file_type,
    p_request_id::text,
    p_file_type,
    p_attachment_uid::text
  );
end;
$$;


ALTER FUNCTION "private"."clear_request_attachment_uid_reference"("p_request_id" "uuid", "p_file_type" "text", "p_attachment_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_notification_from_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_request_user uuid;
  v_request_admin uuid;
begin
  if new.request_id is null then
    return new;
  end if;

  v_request_user := private.notification_request_owner(new.request_table, new.request_id);

  if v_request_user is null then
    return new;
  end if;

  -- Current best effort: treat actor as admin when actor differs from request owner.
  v_request_admin := case
    when new.changed_by is not null and new.changed_by is distinct from v_request_user then new.changed_by
    else null
  end;

  insert into public.notifications (
    audit_log_id,
    request_table,
    request_id,
    "admin",
    "user",
    is_read,
    title,
    body,
    old_status,
    new_status,
    created_at
  )
  values (
    new.id,
    new.request_table,
    new.request_id,
    v_request_admin,
    v_request_user,
    false,
    private.notification_title(new.request_table, new.action),
    private.notification_body(new.request_table, new.action, new.old_status, new.new_status),
    new.old_status,
    new.new_status,
    coalesce(new.changed_at, now())
  )
  on conflict (audit_log_id) do update
  set
    request_table = excluded.request_table,
    request_id = excluded.request_id,
    "admin" = excluded."admin",
    "user" = excluded."user",
    title = excluded.title,
    body = excluded.body,
    old_status = excluded.old_status,
    new_status = excluded.new_status,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "private"."create_notification_from_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_user_notification_from_audit_log"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_owner uuid;
  v_new_status_normalized text;
  v_new_at timestamptz;
begin
  if new.request_id is null then
    return new;
  end if;

  -- Request teardown / account-cleanup audit events should not notify anyone.
  if upper(coalesce(new.action, '')) = 'DELETE' then
    return new;
  end if;

  v_new_status_normalized := lower(replace(coalesce(new.new_status, ''), '_', ' '));
  if v_new_status_normalized in ('draft', 'deleted') then
    return new;
  end if;

  v_owner := private.user_notification_request_owner(
    'assistance_requests',
    new.request_id
  );
  if v_owner is null then
    return new;
  end if;

  -- Owner account already gone (or mid-delete) — do not insert notifications.
  if not exists (select 1 from auth.users u where u.id = v_owner) then
    return new;
  end if;

  -- MOBILE RULE: only notify the applicant about admin/system-driven changes.
  if new.changed_by is not null and new.changed_by = v_owner then
    return new;
  end if;

  v_new_at := coalesce(new.changed_at, now());

  insert into public.user_notification (
    user_id,
    request_id,
    audit_log_id,
    action,
    old_status,
    new_status,
    is_read,
    created_at,
    updated_at
  )
  values (
    v_owner,
    new.request_id,
    new.id,
    new.action,
    new.old_status,
    new.new_status,
    false,
    v_new_at,
    now()
  )
  on conflict (user_id, request_id) do update
  set
    audit_log_id = excluded.audit_log_id,
    action = excluded.action,
    old_status = excluded.old_status,
    new_status = excluded.new_status,
    is_read = false,
    created_at = excluded.created_at,
    updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "private"."create_user_notification_from_audit_log"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."delete_request_attachments_for_deleted_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
begin
  delete from public.request_attachments
  where request_table = tg_table_name
    and request_uid = old.id;
  return old;
end;
$$;


ALTER FUNCTION "private"."delete_request_attachments_for_deleted_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."dispatch_request_attachment_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  bucket_name text := 'request-documents';
  endpoint text;
  hook_secret text;
  old_path text;
  new_path text;
  req_id bigint;
  rowid text;
begin
  old_path := private.extract_storage_path(old.path);

  if tg_op = 'DELETE' then
    if old_path is null then
      return old;
    end if;
  elsif tg_op = 'UPDATE' then
    new_path := private.extract_storage_path(new.path);
    if old_path is null or old_path is not distinct from new_path then
      return new;
    end if;
  else
    return coalesce(new, old);
  end if;

  select value into endpoint
  from private.storage_cleanup_config
  where key = 'function_url'
  limit 1;

  select value into hook_secret
  from private.storage_cleanup_config
  where key = 'hook_secret'
  limit 1;

  if endpoint is null or hook_secret is null then
    raise exception 'Missing storage cleanup config. Set function_url and hook_secret in private.storage_cleanup_config';
  end if;

  rowid := coalesce(old.uid::text, new.uid::text);

  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', hook_secret
    ),
    body := jsonb_build_object(
      'bucket', bucket_name,
      'paths', jsonb_build_array(old_path),
      'table', tg_table_name,
      'op', tg_op,
      'row_id', rowid
    )
  ) into req_id;

  insert into private.storage_cleanup_dispatch_log(table_name, op, row_id, bucket, paths, request_id)
  values (tg_table_name, tg_op, rowid, bucket_name, jsonb_build_array(old_path), req_id);

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "private"."dispatch_request_attachment_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."dispatch_storage_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  bucket_name text := TG_ARGV[0];
  endpoint text;
  hook_secret text;
  c text;
  old_path text;
  new_path text;
  paths text[] := '{}';
  dedup_paths text[];
  req_id bigint;
  rowid text;
  i int;
begin
  if TG_NARGS < 2 then
    raise exception 'dispatch_storage_cleanup requires bucket + at least 1 column';
  end if;

  for i in 1..TG_NARGS-1 loop
    c := TG_ARGV[i];
    old_path := private.extract_storage_path(to_jsonb(OLD)->>c);

    if TG_OP = 'DELETE' then
      if old_path is not null then
        paths := array_append(paths, old_path);
      end if;
    elsif TG_OP = 'UPDATE' then
      new_path := private.extract_storage_path(to_jsonb(NEW)->>c);
      if old_path is not null and old_path is distinct from new_path then
        paths := array_append(paths, old_path);
      end if;
    end if;
  end loop;

  select array_agg(distinct p)
  into dedup_paths
  from unnest(paths) p
  where p is not null and btrim(p) <> '';

  if coalesce(array_length(dedup_paths, 1), 0) = 0 then
    return coalesce(NEW, OLD);
  end if;

  select value into endpoint
  from private.storage_cleanup_config
  where key = 'function_url'
  limit 1;

  select value into hook_secret
  from private.storage_cleanup_config
  where key = 'hook_secret'
  limit 1;

  if endpoint is null then
    raise exception 'Missing config key: function_url';
  end if;

  if hook_secret is null then
    raise exception 'Missing config key: hook_secret';
  end if;

  rowid := coalesce(to_jsonb(OLD)->>'id', to_jsonb(NEW)->>'id');

  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', hook_secret
    ),
    body := jsonb_build_object(
      'bucket', bucket_name,
      'paths', to_jsonb(dedup_paths),
      'table', TG_TABLE_NAME,
      'op', TG_OP,
      'row_id', rowid
    )
  ) into req_id;

  insert into private.storage_cleanup_dispatch_log(table_name, op, row_id, bucket, paths, request_id)
  values (TG_TABLE_NAME, TG_OP, rowid, bucket_name, to_jsonb(dedup_paths), req_id);

  return coalesce(NEW, OLD);
end;
$$;


ALTER FUNCTION "private"."dispatch_storage_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_audit_log_request_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
begin
  if new.request_id is null then
    raise exception 'request_id cannot be null for audit log entries';
  end if;

  if not exists (
    select 1 from public.assistance_requests r where r.id = new.request_id
  ) then
    raise foreign_key_violation using
      message = 'audit_logs request reference does not exist',
      detail = format('No assistance_requests row with id = %s', new.request_id),
      hint = 'request_id must point to an existing assistance_requests row.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_audit_log_request_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enqueue_admin_notification_for_audit"("p_audit_log_id" "uuid", "p_request_id" "uuid", "p_changed_by" "uuid", "p_changed_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
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


ALTER FUNCTION "private"."enqueue_admin_notification_for_audit"("p_audit_log_id" "uuid", "p_request_id" "uuid", "p_changed_by" "uuid", "p_changed_at" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "private"."enqueue_admin_notification_for_audit"("p_audit_log_id" "uuid", "p_request_id" "uuid", "p_changed_by" "uuid", "p_changed_at" timestamp with time zone) IS 'Live enqueue of admin_notification rows. Approved and declined requests leave the inbox.';



CREATE OR REPLACE FUNCTION "private"."enqueue_super_admin_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
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

  v_name := coalesce(private.applicant_display_name(new.user_id), 'An applicant');
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


ALTER FUNCTION "private"."enqueue_super_admin_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."extract_storage_path"("raw_value" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  j jsonb;
  p text;
begin
  if raw_value is null or btrim(raw_value) = '' then
    return null;
  end if;

  begin
    j := raw_value::jsonb;
    p := nullif(btrim(j->>'path'), '');
    if p is not null then
      return p;
    end if;
  exception when others then
    null;
  end;

  return nullif(btrim(raw_value), '');
end;
$$;


ALTER FUNCTION "private"."extract_storage_path"("raw_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_optional_attachment_requirement"("p_slot_key" "text", "p_required" boolean) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(p_required, true) = false
    or lower(trim(coalesce(p_slot_key, ''))) in (
      'attachment',
      'attachments',
      'additional_attachment',
      'additionalattachment'
    );
$$;


ALTER FUNCTION "private"."is_optional_attachment_requirement"("p_slot_key" "text", "p_required" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_user_initiated_assistance_audit"("p_request_id" "uuid", "p_changed_by" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "private"."is_user_initiated_assistance_audit"("p_request_id" "uuid", "p_changed_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_user_initiated_audit_movement"("p_request_table" "text", "p_request_id" "uuid", "p_changed_by" "uuid", "p_changed_by_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_owner uuid;
  v_role text;
begin
  v_owner := private.user_notification_request_owner(p_request_table, p_request_id);

  if v_owner is null then
    return false;
  end if;

  if p_changed_by is not null and p_changed_by = v_owner then
    return true;
  end if;

  v_role := lower(coalesce(trim(p_changed_by_role), ''));

  if v_role in ('user', 'applicant', 'requester', 'requestor', 'beneficiary', 'citizen') then
    return true;
  end if;

  return false;
end;
$$;


ALTER FUNCTION "private"."is_user_initiated_audit_movement"("p_request_table" "text", "p_request_id" "uuid", "p_changed_by" "uuid", "p_changed_by_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_registration_name"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')));
$$;


ALTER FUNCTION "private"."normalize_registration_name"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_request_status"("p_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(btrim(replace(coalesce(p_status, ''), '_', ' ')));
$$;


ALTER FUNCTION "private"."normalize_request_status"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_voter_id"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
$$;


ALTER FUNCTION "private"."normalize_voter_id"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notification_body"("p_request_table" "text", "p_action" "text", "p_old_status" "text", "p_new_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case upper(coalesce(p_action, 'UPDATE'))
    when 'INSERT' then
      format(
        '%s request is now %s.',
        private.notification_service_label(p_request_table),
        private.notification_status_label(p_new_status)
      )
    when 'DELETE' then
      format('%s request has been deleted.', private.notification_service_label(p_request_table))
    else
      format(
        '%s request status changed from %s to %s.',
        private.notification_service_label(p_request_table),
        private.notification_status_label(p_old_status),
        private.notification_status_label(p_new_status)
      )
  end;
$$;


ALTER FUNCTION "private"."notification_body"("p_request_table" "text", "p_action" "text", "p_old_status" "text", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notification_request_owner"("p_request_table" "text", "p_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
    when p_request_table = 'hospitalization_requests' then (
      select r.user_id from public.hospitalization_requests r where r.id = p_request_id
    )
    when p_request_table = 'treatment_requests' then (
      select r.user_id from public.treatment_requests r where r.id = p_request_id
    )
    when p_request_table = 'medical_requests' then (
      select r.user_id from public.medical_requests r where r.id = p_request_id
    )
    when p_request_table = 'financial_requests' then (
      select r.user_id from public.financial_requests r where r.id = p_request_id
    )
    when p_request_table = 'monetary_requests' then (
      select r.user_id from public.monetary_requests r where r.id = p_request_id
    )
    when p_request_table = 'burial_requests' then (
      select r.user_id from public.burial_requests r where r.id = p_request_id
    )
    when p_request_table = 'cremation_requests' then (
      select r.user_id from public.cremation_requests r where r.id = p_request_id
    )
    when p_request_table = 'columbarium_requests' then (
      select r.user_id from public.columbarium_requests r where r.id = p_request_id
    )
    else null
  end;
$$;


ALTER FUNCTION "private"."notification_request_owner"("p_request_table" "text", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notification_service_label"("p_request_table" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_request_table
    when 'hospitalization_requests' then 'Hospitalization'
    when 'treatment_requests' then 'Treatment'
    when 'medical_requests' then 'Medical Operations'
    when 'financial_requests' then 'Financial Relief'
    when 'monetary_requests' then 'Monetary Burial Aid'
    when 'burial_requests' then 'Burial Site Assistance'
    when 'cremation_requests' then 'Cremation Assistance'
    when 'columbarium_requests' then 'Columbarium Allocation'
    else 'Assistance'
  end;
$$;


ALTER FUNCTION "private"."notification_service_label"("p_request_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notification_status_label"("p_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select initcap(replace(coalesce(nullif(trim(p_status), ''), 'unknown'), '_', ' '));
$$;


ALTER FUNCTION "private"."notification_status_label"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notification_title"("p_request_table" "text", "p_action" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case upper(coalesce(p_action, 'UPDATE'))
    when 'INSERT' then private.notification_service_label(p_request_table) || ' Request Submitted'
    when 'DELETE' then private.notification_service_label(p_request_table) || ' Request Deleted'
    else private.notification_service_label(p_request_table) || ' Request Updated'
  end;
$$;


ALTER FUNCTION "private"."notification_title"("p_request_table" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prevent_resubmitted_to_in_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_old_status := private.normalize_request_status(old.status);
  v_new_status := private.normalize_request_status(new.status);

  if v_old_status = 'resubmitted'
     and v_new_status in ('in progress', 'inprogress', 'processing')
  then
    raise exception using
      errcode = '23514',
      message = format('Invalid status transition on %I: resubmitted -> %s is not allowed', tg_table_name, coalesce(new.status, 'null')),
      hint = 'Keep status as resubmitted or move forward to a terminal/next valid state.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."prevent_resubmitted_to_in_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_request_attachment_uid_reference"("p_request_id" "uuid", "p_file_type" "text", "p_attachment_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_column_exists boolean;
begin
  if p_request_id is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'assistance_requests'
      and c.column_name = p_file_type
  ) into v_column_exists;

  if not v_column_exists then
    return;
  end if;

  execute format(
    'update public.assistance_requests set %I = %L where id = %L::uuid',
    p_file_type,
    p_attachment_uid::text,
    p_request_id::text
  );
end;
$$;


ALTER FUNCTION "private"."set_request_attachment_uid_reference"("p_request_id" "uuid", "p_file_type" "text", "p_attachment_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_request_file_uid_from_attachment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform private.set_request_attachment_uid_reference(
      new.assistance_request_id,
      new.file_type,
      new.uid
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.assistance_request_id is distinct from new.assistance_request_id
      or old.file_type is distinct from new.file_type
    then
      perform private.clear_request_attachment_uid_reference(
        old.assistance_request_id,
        old.file_type,
        old.uid
      );
    end if;

    perform private.set_request_attachment_uid_reference(
      new.assistance_request_id,
      new.file_type,
      new.uid
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.clear_request_attachment_uid_reference(
      old.assistance_request_id,
      old.file_type,
      old.uid
    );
    return old;
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "private"."sync_request_file_uid_from_attachment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."trg_audit_logs_enqueue_admin_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
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


ALTER FUNCTION "private"."trg_audit_logs_enqueue_admin_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."user_notification_request_owner"("p_request_table" "text", "p_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.user_id
  from public.assistance_requests r
  where r.id = p_request_id;
$$;


ALTER FUNCTION "private"."user_notification_request_owner"("p_request_table" "text", "p_request_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."registration_attempts" (
    "id" bigint NOT NULL,
    "email" "text" NOT NULL,
    "attempt_token" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '2 days'::interval) NOT NULL,
    "consumed_at" timestamp with time zone
);


ALTER TABLE "private"."registration_attempts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."registration_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."registration_attempts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."registration_attempts_id_seq" OWNED BY "private"."registration_attempts"."id";



CREATE TABLE IF NOT EXISTS "private"."storage_cleanup_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."storage_cleanup_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."storage_cleanup_dispatch_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "table_name" "text" NOT NULL,
    "op" "text" NOT NULL,
    "row_id" "text",
    "bucket" "text" NOT NULL,
    "paths" "jsonb" NOT NULL,
    "request_id" bigint
);


ALTER TABLE "private"."storage_cleanup_dispatch_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."storage_cleanup_dispatch_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."storage_cleanup_dispatch_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "private"."storage_cleanup_dispatch_log_id_seq" OWNED BY "private"."storage_cleanup_dispatch_log"."id";



ALTER TABLE ONLY "private"."registration_attempts" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."registration_attempts_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."storage_cleanup_dispatch_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"private"."storage_cleanup_dispatch_log_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."registration_attempts"
    ADD CONSTRAINT "registration_attempts_attempt_token_key" UNIQUE ("attempt_token");



ALTER TABLE ONLY "private"."registration_attempts"
    ADD CONSTRAINT "registration_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."storage_cleanup_config"
    ADD CONSTRAINT "storage_cleanup_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "private"."storage_cleanup_dispatch_log"
    ADD CONSTRAINT "storage_cleanup_dispatch_log_pkey" PRIMARY KEY ("id");



CREATE INDEX "registration_attempts_email_created_idx" ON "private"."registration_attempts" USING "btree" ("email", "created_at" DESC);



CREATE INDEX "registration_attempts_token_idx" ON "private"."registration_attempts" USING "btree" ("attempt_token");



REVOKE ALL ON FUNCTION "private"."admin_assistance_category_id"("p_admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."admin_assistance_category_id"("p_admin_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."assistance_category_id_for_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."assistance_category_id_for_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."enqueue_admin_notification_for_audit"("p_audit_log_id" "uuid", "p_request_id" "uuid", "p_changed_by" "uuid", "p_changed_at" timestamp with time zone) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_user_initiated_assistance_audit"("p_request_id" "uuid", "p_changed_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_user_initiated_assistance_audit"("p_request_id" "uuid", "p_changed_by" "uuid") TO "service_role";





CREATE OR REPLACE TRIGGER "assistance_categories_touch" BEFORE UPDATE ON "public"."assistance_categories" FOR EACH ROW EXECUTE FUNCTION "public"."touch_assistance_updated_at"();



CREATE OR REPLACE TRIGGER "assistance_requirement_tips_touch" BEFORE UPDATE ON "public"."assistance_requirement_tips" FOR EACH ROW EXECUTE FUNCTION "public"."touch_assistance_updated_at"();



CREATE OR REPLACE TRIGGER "assistance_requirements_touch" BEFORE UPDATE ON "public"."assistance_requirements" FOR EACH ROW EXECUTE FUNCTION "public"."touch_assistance_updated_at"();



CREATE OR REPLACE TRIGGER "assistance_services_touch" BEFORE UPDATE ON "public"."assistance_services" FOR EACH ROW EXECUTE FUNCTION "public"."touch_assistance_updated_at"();



CREATE OR REPLACE TRIGGER "audit_trail_no_update" BEFORE DELETE OR UPDATE ON "public"."audit_trail" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trail_prevent_mutation"();



CREATE OR REPLACE TRIGGER "request_attachments_updated" BEFORE UPDATE ON "public"."request_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."update_request_attachments_updated"();



CREATE OR REPLACE TRIGGER "settings_stamp" BEFORE INSERT OR UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."tg_settings_stamp_row"();



CREATE OR REPLACE TRIGGER "trg_admin_active_sessions_updated_at" BEFORE UPDATE ON "public"."admin_active_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_active_sessions_updated_at"();



CREATE OR REPLACE TRIGGER "trg_admin_notification_updated_at" BEFORE UPDATE ON "public"."admin_notification" FOR EACH ROW EXECUTE FUNCTION "public"."update_admin_notification_updated_at"();



CREATE OR REPLACE TRIGGER "trg_admins_updated_at" BEFORE UPDATE ON "public"."admins" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_assistance_requests_prevent_resubmitted_to_in_progress" BEFORE UPDATE OF "status" ON "public"."assistance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_no_resubmitted_to_in_progress_transition"();



CREATE OR REPLACE TRIGGER "trg_assistance_requests_super_admin_notification" AFTER INSERT OR UPDATE OF "status" ON "public"."assistance_requests" FOR EACH ROW EXECUTE FUNCTION "private"."enqueue_super_admin_notification"();



CREATE OR REPLACE TRIGGER "trg_audit_assistance_requests_del" BEFORE DELETE ON "public"."assistance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_changes"();



CREATE OR REPLACE TRIGGER "trg_audit_assistance_requests_ins_upd" AFTER INSERT OR UPDATE ON "public"."assistance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_changes"();



CREATE OR REPLACE TRIGGER "trg_audit_logs_admin_notification" AFTER INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "private"."trg_audit_logs_enqueue_admin_notification"();



CREATE OR REPLACE TRIGGER "trg_cascade_archive_assistance_category" AFTER UPDATE OF "active" ON "public"."assistance_categories" FOR EACH ROW EXECUTE FUNCTION "public"."cascade_archive_assistance_category"();



CREATE OR REPLACE TRIGGER "trg_cleanup_request_attachments" AFTER DELETE OR UPDATE ON "public"."request_attachments" FOR EACH ROW EXECUTE FUNCTION "private"."dispatch_request_attachment_cleanup"();



CREATE OR REPLACE TRIGGER "trg_registered_voters_updated_at" BEFORE UPDATE ON "public"."registered_voters" FOR EACH ROW EXECUTE FUNCTION "public"."set_registered_voters_updated_at"();



CREATE OR REPLACE TRIGGER "trg_request_attachments_enforce_action_required_consistency" BEFORE INSERT OR UPDATE OF "status", "assistance_request_id" ON "public"."request_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_attachment_not_in_progress_for_action_required_request"();



CREATE OR REPLACE TRIGGER "trg_stamp_assistance_request_catalog_snapshot" BEFORE INSERT OR UPDATE ON "public"."assistance_requests" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_assistance_request_catalog_snapshot"();



CREATE OR REPLACE TRIGGER "trg_sync_request_file_uid_from_attachment" AFTER INSERT OR DELETE OR UPDATE ON "public"."request_attachments" FOR EACH ROW EXECUTE FUNCTION "private"."sync_request_file_uid_from_attachment"();



CREATE OR REPLACE TRIGGER "trg_user_notification_from_audit_logs" AFTER INSERT ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "private"."create_user_notification_from_audit_log"();



CREATE OR REPLACE TRIGGER "trg_user_notification_updated_at" BEFORE UPDATE ON "public"."user_notification" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_notification_updated_at"();



CREATE OR REPLACE TRIGGER "users_require_confirmed_email" BEFORE INSERT ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."reject_unconfirmed_user_profile"();



CREATE OR REPLACE TRIGGER "web_content_stamp" BEFORE INSERT OR UPDATE ON "public"."web_content" FOR EACH ROW EXECUTE FUNCTION "public"."tg_web_content_stamp_row"();



ALTER TABLE ONLY "public"."admin_active_sessions"
    ADD CONSTRAINT "admin_active_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notification"
    ADD CONSTRAINT "admin_notification_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admins"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notification"
    ADD CONSTRAINT "admin_notification_assistance_request_id_fkey" FOREIGN KEY ("assistance_request_id") REFERENCES "public"."assistance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notification"
    ADD CONSTRAINT "admin_notification_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."assistance_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistance_requests"
    ADD CONSTRAINT "assistance_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."assistance_categories"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assistance_requests"
    ADD CONSTRAINT "assistance_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."assistance_services"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assistance_requests"
    ADD CONSTRAINT "assistance_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assistance_requirement_tips"
    ADD CONSTRAINT "assistance_requirement_tips_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "public"."assistance_requirements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistance_requirements"
    ADD CONSTRAINT "assistance_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."assistance_services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistance_services"
    ADD CONSTRAINT "assistance_services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."assistance_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON UPDATE RESTRICT ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registered_voters"
    ADD CONSTRAINT "registered_voters_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON UPDATE RESTRICT ON DELETE SET NULL;



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_assistance_request_id_fkey" FOREIGN KEY ("assistance_request_id") REFERENCES "public"."assistance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."super_admin_notification_read"
    ADD CONSTRAINT "super_admin_notification_read_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."super_admin_notification"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."super_admin_notification"
    ADD CONSTRAINT "super_admin_notification_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."assistance_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_notification"
    ADD CONSTRAINT "user_notification_audit_log_id_fkey" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notification"
    ADD CONSTRAINT "user_notification_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."assistance_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notification"
    ADD CONSTRAINT "user_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_push_token"
    ADD CONSTRAINT "user_push_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_registered_voter_id_fkey" FOREIGN KEY ("registered_voter_id") REFERENCES "public"."registered_voters"("id");



ALTER TABLE ONLY "public"."web_content"
    ADD CONSTRAINT "web_content_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can view own profile" ON "public"."admins" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "No client writes to audit logs" ON "public"."audit_logs" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "No direct delete from client" ON "public"."admins" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "No direct insert from client" ON "public"."admins" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "No direct update from client" ON "public"."admins" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Users can read request audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."can_read_audit_log"('assistance_requests'::"text", "request_id"));



ALTER TABLE "public"."admin_active_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_active_sessions_delete_own" ON "public"."admin_active_sessions" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."is_any_admin"()));



CREATE POLICY "admin_active_sessions_insert_own" ON "public"."admin_active_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_any_admin"()));



CREATE POLICY "admin_active_sessions_select_own" ON "public"."admin_active_sessions" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."is_any_admin"()));



CREATE POLICY "admin_active_sessions_update_own" ON "public"."admin_active_sessions" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND "public"."is_any_admin"())) WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_any_admin"()));



CREATE POLICY "admin_active_sessions_upsert_own" ON "public"."admin_active_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."is_any_admin"()));



ALTER TABLE "public"."admin_notification" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_notification_no_client_delete" ON "public"."admin_notification" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "admin_notification_no_client_insert" ON "public"."admin_notification" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "admin_notification_select_own" ON "public"."admin_notification" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "admin_user_id"));



CREATE POLICY "admin_notification_update_own" ON "public"."admin_notification" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "admin_user_id")) WITH CHECK (("auth"."uid"() = "admin_user_id"));



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_select_own" ON "public"."admins" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."assistance_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistance_categories_public_read_active" ON "public"."assistance_categories" FOR SELECT TO "authenticated", "anon" USING (("active" IS TRUE));



CREATE POLICY "assistance_categories_select" ON "public"."assistance_categories" FOR SELECT TO "authenticated", "anon" USING ((("active" = true) OR "public"."is_superadmin"("auth"."uid"())));



CREATE POLICY "assistance_categories_select_history" ON "public"."assistance_categories" FOR SELECT TO "authenticated" USING ("public"."rls_can_select_assistance_category"("id"));



CREATE POLICY "assistance_categories_write" ON "public"."assistance_categories" TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."assistance_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistance_requests_admin_select" ON "public"."assistance_requests" FOR SELECT TO "authenticated" USING ("public"."rls_admin_can_access_request_row"("status", "category_id", "service_id"));



CREATE POLICY "assistance_requests_admin_update" ON "public"."assistance_requests" FOR UPDATE TO "authenticated" USING ("public"."rls_admin_can_access_request_row"("status", "category_id", "service_id")) WITH CHECK ("public"."rls_admin_can_access_request_row"("status", "category_id", "service_id"));



CREATE POLICY "assistance_requests_owner_all" ON "public"."assistance_requests" TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_superadmin"("auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "user_id") OR "public"."is_superadmin"("auth"."uid"())));



ALTER TABLE "public"."assistance_requirement_tips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistance_requirement_tips_public_read_for_active_services" ON "public"."assistance_requirement_tips" FOR SELECT TO "authenticated", "anon" USING ("public"."rls_requirement_is_on_active_service"("requirement_id"));



CREATE POLICY "assistance_requirement_tips_select_history" ON "public"."assistance_requirement_tips" FOR SELECT TO "authenticated" USING ("public"."rls_can_select_requirement_tip"("requirement_id"));



CREATE POLICY "assistance_requirement_tips_write" ON "public"."assistance_requirement_tips" TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."assistance_requirements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistance_requirements_public_read_for_active_services" ON "public"."assistance_requirements" FOR SELECT TO "authenticated", "anon" USING ("public"."rls_service_is_active"("service_id"));



CREATE POLICY "assistance_requirements_select_history" ON "public"."assistance_requirements" FOR SELECT TO "authenticated" USING ("public"."rls_can_select_assistance_requirement"("service_id"));



CREATE POLICY "assistance_requirements_write" ON "public"."assistance_requirements" TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."assistance_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistance_services_public_read_active" ON "public"."assistance_services" FOR SELECT TO "authenticated", "anon" USING (("active" IS TRUE));



CREATE POLICY "assistance_services_select_history" ON "public"."assistance_services" FOR SELECT TO "authenticated" USING ("public"."rls_can_select_assistance_service"("id", "category_id"));



CREATE POLICY "assistance_services_write" ON "public"."assistance_services" TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_trail" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_trail_select_superadmin" ON "public"."audit_trail" FOR SELECT TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."barangays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "barangays_select_anon" ON "public"."barangays" FOR SELECT TO "anon" USING (true);



CREATE POLICY "barangays_select_authenticated" ON "public"."barangays" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."registered_voters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registered_voters_superadmin_all" ON "public"."registered_voters" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_super_admin" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."admins" "a"
  WHERE (("a"."user_id" = "auth"."uid"()) AND ("a"."is_super_admin" = true)))));



ALTER TABLE "public"."request_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "request_attachments_access_by_request_id" ON "public"."request_attachments" TO "authenticated" USING ("public"."can_access_request_attachment"("assistance_request_id")) WITH CHECK ("public"."can_access_request_attachment"("assistance_request_id"));



ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settings_select" ON "public"."settings" FOR SELECT TO "authenticated" USING ((("is_active" = true) AND ("public"."is_superadmin"("auth"."uid"()) OR (("is_secret" = false) AND (("visibility" = 'public'::"text") OR ("visibility" = 'authenticated'::"text") OR (("visibility" = 'admin'::"text") AND "public"."is_any_admin"()) OR (("visibility" = 'superadmin'::"text") AND "public"."is_superadmin"("auth"."uid"())))))));



CREATE POLICY "settings_select_anon" ON "public"."settings" FOR SELECT TO "anon" USING ((("is_active" = true) AND ("is_secret" = false) AND ("visibility" = 'public'::"text")));



CREATE POLICY "settings_write" ON "public"."settings" TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"())) WITH CHECK ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."super_admin_notification" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."super_admin_notification_read" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "super_admin_notification_read_select" ON "public"."super_admin_notification_read" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"("auth"."uid"()) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "super_admin_notification_select" ON "public"."super_admin_notification" FOR SELECT TO "authenticated" USING ("public"."is_superadmin"("auth"."uid"()));



ALTER TABLE "public"."user_notification" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notification_select_own" ON "public"."user_notification" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notification_update_own" ON "public"."user_notification" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_push_token" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_push_token_modify_own" ON "public"."user_push_token" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_push_token_select_own" ON "public"."user_push_token" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users_select" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_superadmin"("auth"."uid"()) OR "public"."admin_can_access_user_profile"("id")));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."web_content" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_can_access_assistance_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_can_access_assistance_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_can_access_assistance_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_can_access_user_profile"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_can_access_user_profile"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_can_access_user_profile"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_request_op"("op" "text", "service_type" "text", "request_id" "uuid", "patch" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_trail_prevent_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_trail_prevent_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_trail_prevent_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."begin_registration_attempt"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_registration_attempt"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_registration_attempt"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_request_attachment"("p_request_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_request_attachment"("p_request_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_request_attachment"("p_request_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_request_attachment"("p_request_table" "text", "p_request_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_request_attachment"("p_request_table" "text", "p_request_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_request_attachment"("p_request_table" "text", "p_request_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_request_table"("p_request_table" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_request_table"("p_request_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_request_table"("p_request_table" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_read_audit_log"("p_request_table" "text", "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_audit_log"("p_request_table" "text", "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_audit_log"("p_request_table" "text", "p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cascade_archive_assistance_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_archive_assistance_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_archive_assistance_category"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_admin_session"("p_user_id" "uuid", "p_email" "text", "p_session_id" "text", "p_ttl_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_admin_session"("p_user_id" "uuid", "p_email" "text", "p_session_id" "text", "p_ttl_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_admin_session"("p_user_id" "uuid", "p_email" "text", "p_session_id" "text", "p_ttl_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_admin_session"("p_user_id" "uuid", "p_email" "text", "p_session_id" "text", "p_ttl_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_stale_admin_active_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_stale_admin_active_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_admin_active_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_admin_active_sessions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_user_notifications"("p_read_retention" interval, "p_remove_superseded" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_user_notifications"("p_read_retention" interval, "p_remove_superseded" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_user_notifications"("p_read_retention" interval, "p_remove_superseded" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."count_unread_super_admin_notifications"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_unread_super_admin_notifications"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_admin_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_admin_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_admin_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."disable_user_push_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."disable_user_push_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_user_push_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_attachment_not_in_progress_for_action_required_request"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_attachment_not_in_progress_for_action_required_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_attachment_not_in_progress_for_action_required_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_no_redundant_action_required_resend"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_no_redundant_action_required_resend"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_no_redundant_action_required_resend"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_no_resubmitted_to_in_progress_transition"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_no_resubmitted_to_in_progress_transition"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_no_resubmitted_to_in_progress_transition"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_request_action_required_without_in_progress_attachments"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_request_action_required_without_in_progress_attachments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_request_action_required_without_in_progress_attachments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_request_action_required_without_in_progress_or_resubmit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_request_action_required_without_in_progress_or_resubmit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_request_action_required_without_in_progress_or_resubmit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_registration_profile"("p_attempt_token" "uuid", "p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_contact_number" "text", "p_email" "text", "p_voter_id_number" "text", "p_address" "text", "p_birth_date" "text", "p_sex" "text", "p_registered_voter_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."format_request_code"("p_code" "text", "p_ts" timestamp with time zone, "p_seq" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."format_request_code"("p_code" "text", "p_ts" timestamp with time zone, "p_seq" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."format_request_code"("p_code" "text", "p_ts" timestamp with time zone, "p_seq" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_burial_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_burial_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_burial_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_catalog_request_code"("p_prefix" "text", "p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_catalog_request_code"("p_prefix" "text", "p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_catalog_request_code"("p_prefix" "text", "p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_columbarium_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_columbarium_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_columbarium_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_cremation_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_cremation_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_cremation_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_financial_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_financial_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_financial_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_hospitalization_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_hospitalization_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_hospitalization_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_medical_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_medical_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_medical_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_monetary_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_monetary_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_monetary_request_code"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_request_code_for_service"("p_service" "text", "p_timestamp" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_request_code_for_service"("p_service" "text", "p_timestamp" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_request_code_for_service"("p_service" "text", "p_timestamp" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_treatment_request_code"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_treatment_request_code"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_treatment_request_code"("p_ts" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_session_by_user_id"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_session_by_user_id"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_session_by_user_id"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_session_by_user_id"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_latest_notifications_for_user"("p_user_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_latest_notifications_for_user"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_latest_notifications_for_user"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unread_notification_count_for_admin"("p_admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unread_notification_count_for_admin"("p_admin_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count_for_admin"("p_admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count_for_admin"("p_admin_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unread_notification_count_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unread_notification_count_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_action_required_request_status"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_action_required_request_status"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_action_required_request_status"("p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_session_locked"("p_email" "text", "p_candidate_session_id" "text", "p_ttl_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_session_locked"("p_email" "text", "p_candidate_session_id" "text", "p_ttl_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_session_locked"("p_email" "text", "p_candidate_session_id" "text", "p_ttl_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_session_locked"("p_email" "text", "p_candidate_session_id" "text", "p_ttl_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_any_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_any_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_any_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_burial_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_burial_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_burial_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_financial_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_financial_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_financial_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_in_progress_attachment_status"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_in_progress_attachment_status"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_in_progress_attachment_status"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_in_progress_request_status"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_in_progress_request_status"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_in_progress_request_status"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_managed_request_table"("p_request_table" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_managed_request_table"("p_request_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_managed_request_table"("p_request_table" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_medical_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_medical_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_medical_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_medical_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_registration_email_available"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_registration_email_available"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_registration_email_available"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_registration_email_available"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_resubmitted_attachment_status"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_resubmitted_attachment_status"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_resubmitted_attachment_status"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_resubmitted_request_status"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_resubmitted_request_status"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_resubmitted_request_status"("p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_superadmin"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_superadmin"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."line_admin_matches_category"("p_user_id" "uuid", "p_category_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."line_admin_matches_category"("p_user_id" "uuid", "p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."line_admin_matches_category"("p_user_id" "uuid", "p_category_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_super_admin_notifications"("p_user_id" "uuid", "p_page" integer, "p_page_size" integer, "p_status" "text", "p_event_type" "text", "p_search" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_super_admin_notifications"("p_user_id" "uuid", "p_page" integer, "p_page_size" integer, "p_status" "text", "p_event_type" "text", "p_search" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lookup_registered_voter_by_voter_id"("p_voter_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_all_super_admin_notifications_read"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_super_admin_notifications_read"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_request_notifications_read"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_request_notifications_read"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_request_notifications_read"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_request_notifications_read_for_user"("p_user_id" "uuid", "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_request_notifications_read_for_user"("p_user_id" "uuid", "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_request_notifications_read_for_user"("p_user_id" "uuid", "p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_super_admin_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_super_admin_notification_read"("p_user_id" "uuid", "p_notification_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_admin_role"("p_role" "text", "p_service_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_admin_role"("p_role" "text", "p_service_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_admin_role"("p_role" "text", "p_service_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_financial_requests_service_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_financial_requests_service_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_financial_requests_service_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_financial_service_id_value"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_financial_service_id_value"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_financial_service_id_value"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_request_table_name"("p_request_table" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_request_table_name"("p_request_table" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_request_table_name"("p_request_table" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_admin_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_admin_notifications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_admin_active_sessions"("p_ttl_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_admin_active_sessions"("p_ttl_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."prune_admin_active_sessions"("p_ttl_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_admin_active_sessions"("p_ttl_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reclaim_unconfirmed_registration_email"("p_email" "text", "p_attempt_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_unconfirmed_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_unconfirmed_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_unconfirmed_user_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_admin_session"("p_user_id" "uuid", "p_session_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_admin_session"("p_user_id" "uuid", "p_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."release_admin_session"("p_user_id" "uuid", "p_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_admin_session"("p_user_id" "uuid", "p_session_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_admin_can_access_request_row"("p_status" "text", "p_category_id" "uuid", "p_service_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_admin_can_access_request_row"("p_status" "text", "p_category_id" "uuid", "p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_admin_can_access_request_row"("p_status" "text", "p_category_id" "uuid", "p_service_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_can_select_assistance_category"("p_category_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_can_select_assistance_category"("p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_can_select_assistance_category"("p_category_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_can_select_assistance_requirement"("p_service_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_can_select_assistance_requirement"("p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_can_select_assistance_requirement"("p_service_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_can_select_assistance_service"("p_service_id" "uuid", "p_category_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_can_select_assistance_service"("p_service_id" "uuid", "p_category_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_can_select_assistance_service"("p_service_id" "uuid", "p_category_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_can_select_requirement_tip"("p_requirement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_can_select_requirement_tip"("p_requirement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_can_select_requirement_tip"("p_requirement_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_requirement_is_on_active_service"("p_requirement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_requirement_is_on_active_service"("p_requirement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_requirement_is_on_active_service"("p_requirement_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rls_requirement_is_on_active_service"("p_requirement_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."rls_service_is_active"("p_service_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_service_is_active"("p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_service_is_active"("p_service_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."rls_service_is_active"("p_service_id" "uuid") TO "anon";



REVOKE ALL ON FUNCTION "public"."set_admin_active_sessions_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_admin_active_sessions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_active_sessions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_active_sessions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_burial_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_burial_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_burial_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_columbarium_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_columbarium_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_columbarium_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_cremation_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_cremation_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cremation_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_financial_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_financial_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_financial_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_financial_request_user_id_default"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_financial_request_user_id_default"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_financial_request_user_id_default"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_hospitalization_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_hospitalization_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_hospitalization_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_medical_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_medical_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_medical_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_monetary_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_monetary_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_monetary_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_registered_voters_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_registered_voters_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_registered_voters_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_treatment_request_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_treatment_request_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_treatment_request_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."stamp_assistance_request_catalog_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."stamp_assistance_request_catalog_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."stamp_assistance_request_catalog_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_assistance_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_assistance_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_assistance_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."superadmin_list_admins"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_list_admins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_list_admins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_settings_stamp_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_settings_stamp_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_settings_stamp_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_web_content_stamp_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_web_content_stamp_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_web_content_stamp_row"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_admin_session"("p_user_id" "uuid", "p_session_id" "text", "p_ttl_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_admin_session"("p_user_id" "uuid", "p_session_id" "text", "p_ttl_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."touch_admin_session"("p_user_id" "uuid", "p_session_id" "text", "p_ttl_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_admin_session"("p_user_id" "uuid", "p_session_id" "text", "p_ttl_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_assistance_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_assistance_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_assistance_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_admin_notification_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_admin_notification_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_admin_notification_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_request_attachments_updated"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_request_attachments_updated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_request_attachments_updated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_notification_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_notification_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_notification_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_user_push_token"("p_token" "text", "p_platform" "text", "p_device_id" "text", "p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_user_push_token"("p_token" "text", "p_platform" "text", "p_device_id" "text", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user_push_token"("p_token" "text", "p_platform" "text", "p_device_id" "text", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_registration_attempt_token"("p_token" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_registration_attempt_token"("p_token" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_registration_attempt_token"("p_token" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_registration_attempt_token"("p_token" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_registered_voter_for_registration"("p_first_name" "text", "p_middle_name" "text", "p_last_name" "text", "p_suffix" "text", "p_birth_date" "text", "p_sex" "text", "p_barangay_id" "uuid", "p_voter_id_number" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_voter_id_for_registration"("p_registered_voter_id" "uuid", "p_voter_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_voter_id_for_registration"("p_registered_voter_id" "uuid", "p_voter_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_voter_id_for_registration"("p_registered_voter_id" "uuid", "p_voter_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_voter_id_for_registration"("p_registered_voter_id" "uuid", "p_voter_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."admin_active_sessions" TO "anon";
GRANT ALL ON TABLE "public"."admin_active_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_active_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notification" TO "anon";
GRANT ALL ON TABLE "public"."admin_notification" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notification" TO "service_role";



GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assistance_catalog_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assistance_catalog_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assistance_catalog_request_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assistance_categories" TO "anon";
GRANT ALL ON TABLE "public"."assistance_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."assistance_categories" TO "service_role";



GRANT ALL ON TABLE "public"."assistance_requests" TO "anon";
GRANT ALL ON TABLE "public"."assistance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."assistance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."assistance_requirement_tips" TO "anon";
GRANT ALL ON TABLE "public"."assistance_requirement_tips" TO "authenticated";
GRANT ALL ON TABLE "public"."assistance_requirement_tips" TO "service_role";



GRANT ALL ON TABLE "public"."assistance_requirements" TO "anon";
GRANT ALL ON TABLE "public"."assistance_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."assistance_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."assistance_services" TO "anon";
GRANT ALL ON TABLE "public"."assistance_services" TO "authenticated";
GRANT ALL ON TABLE "public"."assistance_services" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_trail" TO "anon";
GRANT ALL ON TABLE "public"."audit_trail" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_trail" TO "service_role";



GRANT ALL ON TABLE "public"."barangays" TO "anon";
GRANT ALL ON TABLE "public"."barangays" TO "authenticated";
GRANT ALL ON TABLE "public"."barangays" TO "service_role";



GRANT ALL ON SEQUENCE "public"."burial_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."burial_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."burial_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."columbarium_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."columbarium_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."columbarium_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cremation_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cremation_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cremation_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."financial_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."financial_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."financial_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hospitalization_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hospitalization_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hospitalization_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."medical_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."medical_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."medical_request_code_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."monetary_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."monetary_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."monetary_request_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."registered_voters" TO "anon";
GRANT ALL ON TABLE "public"."registered_voters" TO "authenticated";
GRANT ALL ON TABLE "public"."registered_voters" TO "service_role";



GRANT ALL ON TABLE "public"."request_attachments" TO "anon";
GRANT ALL ON TABLE "public"."request_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."request_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."super_admin_notification" TO "anon";
GRANT ALL ON TABLE "public"."super_admin_notification" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admin_notification" TO "service_role";



GRANT ALL ON TABLE "public"."super_admin_notification_read" TO "anon";
GRANT ALL ON TABLE "public"."super_admin_notification_read" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admin_notification_read" TO "service_role";



GRANT ALL ON SEQUENCE "public"."treatment_request_code_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."treatment_request_code_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."treatment_request_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification" TO "anon";
GRANT ALL ON TABLE "public"."user_notification" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_token" TO "anon";
GRANT ALL ON TABLE "public"."user_push_token" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_token" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."users" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."web_content" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."web_content" TO "authenticated";
GRANT ALL ON TABLE "public"."web_content" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









insert into storage.buckets (id, name, public)
values ('request-documents', 'request-documents', true)
on conflict (id) do update set public = excluded.public;