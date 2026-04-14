-- Harden request status transitions: a request cannot be marked action required
-- while any related attachment is still resubmitted.

create or replace function public.is_resubmitted_attachment_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_status, ''))) in (
    'resubmitted',
    'resubmission',
    'resubmission_required'
  );
$$;

create or replace function public.enforce_request_action_required_without_in_progress_or_resubmitted_attachments()
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
          execute function public.enforce_request_action_required_without_in_progress_or_resubmitted_attachments()',
        v_table
      );
    end if;
  end loop;
end
$$;