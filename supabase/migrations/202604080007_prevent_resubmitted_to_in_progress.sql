-- Prevent requests from transitioning from resubmitted back to in progress.

create or replace function public.is_resubmitted_request_status(p_status text)
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

create or replace function public.is_in_progress_request_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_status, ''))) in ('in progress', 'in_progress');
$$;

create or replace function public.enforce_no_resubmitted_to_in_progress_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_resubmitted_request_status(old.status::text)
     and public.is_in_progress_request_status(new.status::text) then
    raise exception using
      errcode = '23514',
      message = 'Invalid status transition: resubmitted requests cannot be moved back to in progress.',
      detail = format('table=%s id=%s old_status=%s new_status=%s', tg_table_name, new.id::text, coalesce(old.status::text, 'null'), coalesce(new.status::text, 'null')),
      hint = 'Keep the request in Resubmitted until it is reviewed to Action Required, Approved, or another allowed terminal status.';
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
        'drop trigger if exists trg_%1$s_prevent_resubmitted_to_in_progress on public.%1$I',
        v_table
      );

      execute format(
        'create trigger trg_%1$s_prevent_resubmitted_to_in_progress
          before update of status
          on public.%1$I
          for each row
          execute function public.enforce_no_resubmitted_to_in_progress_transition()',
        v_table
      );
    end if;
  end loop;
end
$$;