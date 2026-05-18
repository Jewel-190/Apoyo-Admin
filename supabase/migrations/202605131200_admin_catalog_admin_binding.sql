-- Bind assistance_categories ↔ admin roles + theme tokens for the web admin console.
-- Optional admins.category_id lets an operator pin an admin user to one catalog category.

begin;

set search_path = public;

alter table public.assistance_categories
  add column if not exists admin_role_key text;

alter table public.assistance_categories
  add column if not exists theme_json jsonb not null default '{}'::jsonb;

comment on column public.assistance_categories.admin_role_key is
  'Single admin role (medical_admin | financial_admin | burial_admin) served by this assistance category.';

comment on column public.assistance_categories.theme_json is
  'Admin UI palette: primary, secondary, tertiary, accent, ring (hex strings).';

create unique index if not exists assistance_categories_admin_role_key_uidx
  on public.assistance_categories (admin_role_key)
  where admin_role_key is not null;

alter table public.admins
  add column if not exists category_id uuid references public.assistance_categories (id) on delete set null;

create index if not exists admins_category_id_idx on public.admins (category_id);

update public.assistance_categories set
  admin_role_key = 'medical_admin',
  theme_json = '{"primary":"#008B88","secondary":"#06C1EC","tertiary":"#33BFB8","accent":"#87CE60","ring":"#14B8A6"}'::jsonb
where slug = 'medical';

update public.assistance_categories set
  admin_role_key = 'financial_admin',
  theme_json = '{"primary":"#A16207","secondary":"#F59E0B","tertiary":"#FBBF24","accent":"#FDE68A","ring":"#D97706"}'::jsonb
where slug = 'financial';

update public.assistance_categories set
  admin_role_key = 'burial_admin',
  theme_json = '{"primary":"#6D28D9","secondary":"#8B5CF6","tertiary":"#A78BFA","accent":"#DDD6FE","ring":"#7C3AED"}'::jsonb
where slug = 'burial';

commit;
