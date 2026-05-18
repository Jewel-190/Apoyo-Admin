-- Remove legacy request_table from assistance_services; admin app uses service_key only.

begin;

set search_path = public;

alter table public.assistance_services
  drop column if exists request_table;

commit;
