-- Restore request_table on assistance_services (admin app + RLS join expect it).

begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists request_table text;

update public.assistance_services set request_table = 'hospitalization_requests' where service_key = 'hospital';
update public.assistance_services set request_table = 'treatment_requests' where service_key = 'treatment';
update public.assistance_services set request_table = 'medical_requests' where service_key = 'operations';
update public.assistance_services set request_table = 'financial_requests' where service_key = 'emergency-finance';
update public.assistance_services set request_table = 'monetary_requests' where service_key = 'burial-money';
update public.assistance_services set request_table = 'burial_requests' where service_key = 'burial-site';
update public.assistance_services set request_table = 'cremation_requests' where service_key = 'cremation';
update public.assistance_services set request_table = 'columbarium_requests' where service_key = 'columbarium';

comment on column public.assistance_services.request_table is
  'Legacy physical table name; used by admin UI requestSources and assistance_requests RLS join.';

commit;
