-- Enforce pipeline rule on unified assistance_requests:
-- resubmitted requests cannot revert to in progress.

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
      hint = 'Keep the request in Resubmitted until it is reviewed to Action Required, For Approval, Approved, or another allowed status.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assistance_requests_prevent_resubmitted_to_in_progress
  on public.assistance_requests;

create trigger trg_assistance_requests_prevent_resubmitted_to_in_progress
  before update of status
  on public.assistance_requests
  for each row
  execute function public.enforce_no_resubmitted_to_in_progress_transition();
