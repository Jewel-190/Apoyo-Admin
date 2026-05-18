-- CMS-configurable request code prefix per assistance service.
-- Full codes use format_request_code (PREFIX-MMYY-######) via generate_catalog_request_code.

begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists request_code text;

comment on column public.assistance_services.request_code is
  'Configurable prefix (letters/digits, up to 6). Full request_code assigned on submit via generate_catalog_request_code.';

create sequence if not exists public.assistance_catalog_request_code_seq;

create or replace function public.generate_catalog_request_code(
  p_prefix text,
  p_ts timestamptz default now()
)
returns text
language plpgsql
as $$
declare
  v_seq bigint;
  v_prefix text;
begin
  v_prefix := upper(
    substring(
      regexp_replace(coalesce(trim(p_prefix), ''), '[^a-zA-Z0-9]', '', 'g')
      from 1 for 6
    )
  );
  if length(v_prefix) < 2 then
    v_prefix := 'ASST';
  end if;

  v_seq := nextval('public.assistance_catalog_request_code_seq');
  return public.format_request_code(v_prefix, coalesce(p_ts, now()), v_seq);
end;
$$;

create or replace function public.generate_request_code_for_service(
  p_service text,
  p_timestamp timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service text := lower(trim(coalesce(p_service, '')));
  v_category_slug text;
  v_token text;
  v_cms_prefix text;
begin
  if v_service = '' then
    raise exception 'Unsupported service type: %', p_service using errcode = '22023';
  end if;

  if v_service in (
    'hospitalizationreq',
    'hospitalization',
    'hosp',
    'hospital',
    'hospitalization_requests'
  ) then
    return public.generate_hospitalization_request_code(p_timestamp);
  elsif v_service in (
    'treatmentreq',
    'treatment',
    'treat',
    'treatment_requests'
  ) then
    return public.generate_treatment_request_code(p_timestamp);
  elsif v_service in (
    'medicalreq',
    'medical',
    'med',
    'operations',
    'medical_requests'
  ) then
    return public.generate_medical_request_code(p_timestamp);
  elsif v_service in (
    'financialreq',
    'financial',
    'fin',
    'emergency-finance',
    'financial_requests'
  ) then
    return public.generate_financial_request_code(p_timestamp);
  elsif v_service in (
    'monetaryreq',
    'monetary',
    'mon',
    'burial-money',
    'monetary_requests'
  ) then
    return public.generate_monetary_request_code(p_timestamp);
  elsif v_service in (
    'burialreq',
    'burial',
    'bur',
    'burial-site',
    'burial_requests'
  ) then
    return public.generate_burial_request_code(p_timestamp);
  elsif v_service in (
    'cremationreq',
    'cremation',
    'crem',
    'cremation_requests'
  ) then
    return public.generate_cremation_request_code(p_timestamp);
  elsif v_service in (
    'columbariumreq',
    'columbarium',
    'colombarium',
    'colu',
    'columbarium_requests'
  ) then
    return public.generate_columbarium_request_code(p_timestamp);
  end if;

  select nullif(trim(s.request_code), '')
    into v_cms_prefix
  from public.assistance_services s
  where lower(trim(coalesce(s.request_code_token, ''))) = v_service
     or lower(replace(s.id::text, '-', '')) = v_service
  limit 1;

  if v_cms_prefix is not null then
    return public.generate_catalog_request_code(v_cms_prefix, p_timestamp);
  end if;

  select lower(trim(c.slug)), lower(trim(coalesce(s.request_code_token, '')))
    into v_category_slug, v_token
  from public.assistance_services s
  join public.assistance_categories c on c.id = s.category_id
  where lower(trim(coalesce(s.request_code_token, ''))) = v_service
     or lower(replace(s.id::text, '-', '')) = v_service
  limit 1;

  if v_category_slug is not null then
    if v_category_slug = 'medical' then
      if v_token like '%treat%' then
        return public.generate_treatment_request_code(p_timestamp);
      elsif v_token like '%hosp%' or v_token like '%hospital%' then
        return public.generate_hospitalization_request_code(p_timestamp);
      else
        return public.generate_medical_request_code(p_timestamp);
      end if;
    elsif v_category_slug = 'financial' then
      return public.generate_financial_request_code(p_timestamp);
    elsif v_category_slug = 'burial' then
      if v_token like '%crem%' then
        return public.generate_cremation_request_code(p_timestamp);
      elsif v_token like '%colu%' or v_token like '%columbarium%' then
        return public.generate_columbarium_request_code(p_timestamp);
      elsif v_token like '%mon%' or v_token like '%money%' then
        return public.generate_monetary_request_code(p_timestamp);
      else
        return public.generate_burial_request_code(p_timestamp);
      end if;
    else
      return public.generate_catalog_request_code(v_token, p_timestamp);
    end if;
  end if;

  return public.generate_catalog_request_code(v_service, p_timestamp);
end;
$$;

comment on function public.generate_request_code_for_service(text, timestamptz) is
  'Human-readable request codes: legacy tokens, CMS assistance_services.request_code prefix, category heuristics, or generic fallback.';

grant execute on function public.generate_catalog_request_code(text, timestamptz) to service_role;
grant execute on function public.generate_catalog_request_code(text, timestamptz) to authenticated;

commit;
