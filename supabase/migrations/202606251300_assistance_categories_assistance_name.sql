-- CMS: drop headline, rename label -> assistance_name on assistance_categories.

begin;

set search_path = public;

alter table public.assistance_categories
  drop column if exists headline;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assistance_categories'
      and column_name = 'label'
  ) then
    alter table public.assistance_categories
      rename column label to assistance_name;
  end if;
end $$;

comment on column public.assistance_categories.assistance_name is
  'Short category name from CMS (e.g. Medical). Mobile app appends " Assistance" for long titles.';

commit;
