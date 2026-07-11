-- Rebuild legacy helper functions to work after dropping admins.role/service_type.
-- Keeps session-lock and older helpers compatible with is_super_admin + category_id.

begin;

set search_path = public;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.is_super_admin then 'super_admin'
    when c.slug is not null then lower(trim(c.slug)) || '_admin'
    else null
  end
  from public.admins a
  left join public.assistance_categories c on c.id = a.category_id
  where a.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and (a.is_super_admin = true or a.category_id is not null)
  );
$$;

create or replace function public.is_medical_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'medical'
  );
$$;

create or replace function public.is_financial_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'financial'
  );
$$;

create or replace function public.is_burial_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    join public.assistance_categories c on c.id = a.category_id
    where a.user_id = auth.uid()
      and a.is_super_admin = false
      and lower(trim(c.slug)) = 'burial'
  );
$$;

create or replace function public.normalize_admin_role(p_role text, p_service_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_role, ''))) = 'super_admin' then 'super_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'medical' then 'medical_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'financial' then 'financial_admin'
    when lower(trim(coalesce(p_service_type, ''))) = 'burial' then 'burial_admin'
    else null
  end;
$$;

commit;
