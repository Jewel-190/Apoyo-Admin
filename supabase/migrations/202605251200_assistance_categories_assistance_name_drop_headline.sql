-- Rename assistance_categories.label → assistance_name; drop headline (UI appends "Assistance").

begin;

set search_path = public;

alter table public.assistance_categories
  rename column label to assistance_name;

comment on column public.assistance_categories.assistance_name is
  'Short line name (e.g. Medical). UI displays as "{assistance_name} Assistance".';

alter table public.assistance_categories
  drop column if exists headline;

commit;
