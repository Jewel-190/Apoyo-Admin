-- Prevent redundant action-required resend attempts.
-- Rule: once a request is already action required, it cannot be updated to action required again.

create or replace function public.enforce_no_redundant_action_required_resend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
        'drop trigger if exists trg_%1$s_prevent_redundant_action_required_resend on public.%1$I',
        v_table
      );

      execute format(
        'create trigger trg_%1$s_prevent_redundant_action_required_resend
          before update of status
          on public.%1$I
          for each row
          execute function public.enforce_no_redundant_action_required_resend()',
        v_table
      );
    end if;
  end loop;
end
$$;