-- Fix mobile inserts failing financial_requests_service_id_check.
-- Keep strict check constraint and normalize incoming service_id values.

create or replace function public.normalize_financial_service_id_value(p_value text)
returns text
language sql
immutable
as $$
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

create or replace function public.normalize_financial_requests_service_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.service_id := public.normalize_financial_service_id_value(new.service_id);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.financial_requests') is not null then
    execute 'drop trigger if exists trg_financial_requests_normalize_service_id on public.financial_requests';
    execute 'create trigger trg_financial_requests_normalize_service_id
      before insert or update of service_id
      on public.financial_requests
      for each row
      execute function public.normalize_financial_requests_service_id()';
  end if;
end
$$;

update public.financial_requests
set service_id = public.normalize_financial_service_id_value(service_id)
where service_id is distinct from public.normalize_financial_service_id_value(service_id);
