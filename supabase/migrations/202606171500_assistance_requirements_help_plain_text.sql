do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assistance_requirements'
      and column_name = 'help_html'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assistance_requirements'
      and column_name = 'help'
  ) then
    execute '
      update public.assistance_requirements
      set help = coalesce(help, help_html)
      where help is distinct from coalesce(help, help_html)
    ';
    execute 'alter table public.assistance_requirements drop column help_html';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assistance_requirements'
      and column_name = 'help_html'
  ) then
    execute 'alter table public.assistance_requirements rename column help_html to help';
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'assistance_requirements'
      and column_name = 'help'
  ) then
    execute 'alter table public.assistance_requirements add column help text';
  end if;
end
$$;

update public.assistance_requirements
set help = nullif(trim(regexp_replace(coalesce(help, ''), '<[^>]*>', ' ', 'g')), '')
where help is not null;

comment on column public.assistance_requirements.help is
  'Optional plain-text helper note shown to applicants for this requirement.';
