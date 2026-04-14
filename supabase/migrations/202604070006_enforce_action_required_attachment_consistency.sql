-- Enforce consistency between parent request status and attachment statuses.
-- Rule: A request in action-required state cannot have any attachment in progress.

create or replace function public.is_action_required_request_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_status, ''))) in (
    'action required',
    'action_required',
    'requires_action',
    'for_revision',
    'resubmission_required',
    'resubmission required'
  );
$$;

create or replace function public.is_in_progress_attachment_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_status, ''))) in ('in progress', 'in_progress');
$$;

create or replace function public.enforce_attachment_not_in_progress_for_action_required_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_table text := lower(trim(coalesce(new.request_table::text, '')));
  v_request_uid text := nullif(trim(coalesce(new.request_uid::text, '')), '');
  v_parent_status text;
begin
  if v_request_uid is null or v_request_table = '' then
    return new;
  end if;

  if not public.is_in_progress_attachment_status(new.status::text) then
    return new;
  end if;

  if v_request_table not in (
    'hospitalization_requests',
    'treatment_requests',
    'medical_requests'
  ) then
    return new;
  end if;

  execute format(
    'select status::text from public.%I where id::text = $1 limit 1',
    v_request_table
  )
  into v_parent_status
  using v_request_uid;

  if public.is_action_required_request_status(v_parent_status) then
    raise exception using
      errcode = '23514',
      message = 'Cannot set attachment status to In Progress while parent request is Action Required.',
      detail = format(
        'request_table=%s request_uid=%s attachment_uid=%s',
        v_request_table,
        coalesce(v_request_uid, 'null'),
        coalesce(new.uid::text, 'null')
      ),
      hint = 'Set the attachment status to Action Required/Verified or move the request out of Action Required.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_request_action_required_without_in_progress_attachments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

do $$
begin
  if to_regclass('public.request_attachments') is not null then
    execute 'drop trigger if exists trg_request_attachments_enforce_action_required_consistency on public.request_attachments';
    execute 'create trigger trg_request_attachments_enforce_action_required_consistency
      before insert or update of status, request_uid, request_table
      on public.request_attachments
      for each row
      execute function public.enforce_attachment_not_in_progress_for_action_required_request()';
  end if;
end
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'hospitalization_requests',
    'treatment_requests',
    'medical_requests'
  ]
  loop
    if to_regclass(format('public.%s', v_table)) is not null then
      execute format(
        'drop trigger if exists trg_%1$s_enforce_action_required_consistency on public.%1$I',
        v_table
      );

      execute format(
        'create trigger trg_%1$s_enforce_action_required_consistency
          before insert or update of status
          on public.%1$I
          for each row
          execute function public.enforce_request_action_required_without_in_progress_attachments()',
        v_table
      );
    end if;
  end loop;
end
$$;