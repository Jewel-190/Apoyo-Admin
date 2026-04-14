-- Fix mobile financial request table-name typos causing RLS denial in request_attachments.
-- Also remove deprecated compatibility view.

drop view if exists public.financial_req;

create or replace function public.normalize_request_table_name(p_request_table text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_request_table, '')))
    when 'financial_req' then 'financial_requests'
    when 'financial_request' then 'financial_requests'
    when 'financial_reqquests' then 'financial_requests'
    when 'financial_reqquest' then 'financial_requests'
    else lower(trim(coalesce(p_request_table, '')))
  end;
$$;

update public.request_attachments
set request_table = public.normalize_request_table_name(request_table::text)
where request_table is not null
  and request_table::text <> public.normalize_request_table_name(request_table::text);
