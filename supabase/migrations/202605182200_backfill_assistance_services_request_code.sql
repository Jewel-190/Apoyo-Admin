-- Backfill assistance_services.request_code from legacy request_code_token + category heuristics
-- (same rules as generate_request_code_for_service before CMS prefix column existed).

begin;

set search_path = public;

update public.assistance_services s
set request_code = src.prefix
from (
  select
    s.id,
    case
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'hospitalizationreq', 'hospitalization', 'hosp', 'hospital', 'hospitalization_requests'
      ) then 'HOSP'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'treatmentreq', 'treatment', 'treat', 'treatment_requests'
      ) then 'TREAT'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'medicalreq', 'medical', 'med', 'operations', 'medical_requests'
      ) then 'MED'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'financialreq', 'financial', 'fin', 'emergency-finance', 'financial_requests'
      ) then 'FIN'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'monetaryreq', 'monetary', 'mon', 'burial-money', 'monetary_requests'
      ) then 'MON'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'burialreq', 'burial', 'bur', 'burial-site', 'burial_requests'
      ) then 'BUR'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'cremationreq', 'cremation', 'crem', 'cremation_requests'
      ) then 'CREM'
      when lower(trim(coalesce(s.request_code_token, ''))) in (
        'columbariumreq', 'columbarium', 'colombarium', 'colu', 'columbarium_requests'
      ) then 'COLU'
      when lower(trim(c.slug)) = 'medical' then
        case
          when lower(trim(coalesce(s.request_code_token, ''))) like '%treat%' then 'TREAT'
          when lower(trim(coalesce(s.request_code_token, ''))) like '%hosp%'
            or lower(trim(coalesce(s.request_code_token, ''))) like '%hospital%' then 'HOSP'
          else 'MED'
        end
      when lower(trim(c.slug)) = 'financial' then 'FIN'
      when lower(trim(c.slug)) = 'burial' then
        case
          when lower(trim(coalesce(s.request_code_token, ''))) like '%crem%' then 'CREM'
          when lower(trim(coalesce(s.request_code_token, ''))) like '%colu%'
            or lower(trim(coalesce(s.request_code_token, ''))) like '%columbarium%' then 'COLU'
          when lower(trim(coalesce(s.request_code_token, ''))) like '%mon%'
            or lower(trim(coalesce(s.request_code_token, ''))) like '%money%' then 'MON'
          else 'BUR'
        end
      else
        upper(
          substring(
            regexp_replace(
              coalesce(nullif(trim(s.request_code_token), ''), nullif(trim(s.display_name), ''), 'ASST'),
              '[^a-zA-Z0-9]',
              '',
              'g'
            )
            from 1 for 6
          )
        )
    end as prefix
  from public.assistance_services s
  join public.assistance_categories c on c.id = s.category_id
  where s.request_code is null
) src
where s.id = src.id
  and src.prefix is not null
  and length(src.prefix) >= 2;

commit;
