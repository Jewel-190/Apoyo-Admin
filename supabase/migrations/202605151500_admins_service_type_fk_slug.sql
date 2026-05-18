-- Relate admins.service_type → assistance_categories.slug (FK).
-- Super admins have no catalog line: service_type becomes nullable and is cleared before the FK.

begin;

set search_path = public;

alter table public.admins
  drop constraint if exists admins_service_type_slug_fkey;

alter table public.admins
  drop constraint if exists admins_service_type_check;

-- Must allow NULL before clearing legacy values like 'Super' / 'super'.
alter table public.admins
  alter column service_type drop not null;

-- Normalize to canonical slugs (catalog uses lowercase).
update public.admins
set service_type = lower(trim(service_type))
where service_type is not null;

-- Line scoped by role when service_type is ambiguous or invalid.
update public.admins a
set service_type = case lower(trim(coalesce(a.role, '')))
    when 'medical_admin' then 'medical'
    when 'financial_admin' then 'financial'
    when 'burial_admin' then 'burial'
    else a.service_type
  end
where a.role is not null
  and lower(trim(coalesce(a.role, ''))) in ('medical_admin', 'financial_admin', 'burial_admin');

update public.admins
set service_type = null
where lower(trim(coalesce(role, ''))) = 'super_admin';

update public.admins a
set service_type = null
where a.service_type is not null
  and not exists (
    select 1 from public.assistance_categories c where c.slug = a.service_type
  );

alter table public.admins
  add constraint admins_service_type_slug_fkey
  foreign key (service_type)
  references public.assistance_categories (slug)
  on update cascade
  on delete set null;

comment on column public.admins.service_type is
  'Optional catalog line key; references assistance_categories.slug. Null for super_admin or unscoped.';

commit;
