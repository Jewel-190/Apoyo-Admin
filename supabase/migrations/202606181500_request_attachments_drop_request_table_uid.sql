-- Canonicalize request_attachments to assistance_request_id only.
-- Drops legacy request_uid/request_table after rewriting policies and triggers.

do $$
declare
  v_mismatch_count bigint;
  v_non_assistance_count bigint;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'request_attachments'
      and column_name = 'request_uid'
  ) then
    select count(*)
    into v_mismatch_count
    from public.request_attachments
    where request_uid is distinct from assistance_request_id;

    if v_mismatch_count > 0 then
      raise exception
        'Refactor aborted: request_uid and assistance_request_id mismatch on % row(s).',
        v_mismatch_count;
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'request_attachments'
      and column_name = 'request_table'
  ) then
    select count(*)
    into v_non_assistance_count
    from public.request_attachments
    where lower(trim(coalesce(request_table, ''))) <> 'assistance_requests';

    if v_non_assistance_count > 0 then
      raise exception
        'Refactor aborted: request_table has non-assistance_requests values on % row(s).',
        v_non_assistance_count;
    end if;
  end if;
end
$$;

drop policy if exists "Users can manage their own request attachments" on public.request_attachments;
drop policy if exists "admins can access request attachments by role" on public.request_attachments;

create policy "request_attachments_access_by_request_id"
on public.request_attachments
for all
to authenticated
using (public.can_access_request_attachment(assistance_request_id))
with check (public.can_access_request_attachment(assistance_request_id));

create or replace function public.enforce_attachment_not_in_progress_for_action_required_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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
$function$;

create or replace function private.set_request_attachment_uid_reference(
  p_request_id uuid,
  p_file_type text,
  p_attachment_uid uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
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
$function$;

create or replace function private.clear_request_attachment_uid_reference(
  p_request_id uuid,
  p_file_type text,
  p_attachment_uid uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $function$
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
$function$;

create or replace function private.sync_request_file_uid_from_attachment()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $function$
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
$function$;

create or replace function private.dispatch_request_attachment_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $function$
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
$function$;

drop trigger if exists trg_enforce_request_attachment_parent_fk on public.request_attachments;
drop trigger if exists trg_request_attachments_normalize_request_table_name on public.request_attachments;
drop trigger if exists trg_sync_request_table_file_uid_from_attachment on public.request_attachments;
drop trigger if exists trg_sync_request_file_uid_from_attachment on public.request_attachments;
drop trigger if exists trg_request_attachments_enforce_action_required_consistency on public.request_attachments;

create trigger trg_request_attachments_enforce_action_required_consistency
before insert or update of status, assistance_request_id
on public.request_attachments
for each row
execute function public.enforce_attachment_not_in_progress_for_action_required_request();

create trigger trg_sync_request_file_uid_from_attachment
after insert or update or delete
on public.request_attachments
for each row
execute function private.sync_request_file_uid_from_attachment();

alter table public.request_attachments
  drop constraint if exists request_attachments_request_table_chk;

alter table public.request_attachments
  drop column if exists request_table,
  drop column if exists request_uid;

drop function if exists public.normalize_request_attachment_table_name();
drop function if exists private.enforce_request_attachment_parent_fk();
drop function if exists private.request_attachment_parent_exists(text, uuid);
drop function if exists private.sync_request_table_file_uid_from_attachment();

drop function if exists private.set_request_attachment_uid_reference(text, uuid, text, uuid);
drop function if exists private.clear_request_attachment_uid_reference(text, uuid, text, uuid);

comment on column public.request_attachments.assistance_request_id is
  'Canonical parent request reference for attachment ownership, access checks, and lifecycle sync.';
