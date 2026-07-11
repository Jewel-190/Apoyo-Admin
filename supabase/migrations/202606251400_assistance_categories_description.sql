-- CMS: optional category description (not consumed by mobile yet).

begin;

set search_path = public;

alter table public.assistance_categories
  add column if not exists description text;

comment on column public.assistance_categories.description is
  'Optional CMS copy for the assistance category. Reserved for future mobile/admin use.';

commit;
