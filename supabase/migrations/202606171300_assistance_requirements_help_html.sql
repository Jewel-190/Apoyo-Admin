-- Cohesive catalog schema: requirement-level helper note field used by CMS edit form.
alter table public.assistance_requirements
add column if not exists help_html text;

comment on column public.assistance_requirements.help_html is
  'Optional plain-text helper note shown to applicants for this requirement.';
