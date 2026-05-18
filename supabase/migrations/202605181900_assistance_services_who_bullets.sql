-- “Who may avail” bullet list for mobile Request Info.

begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists who_bullets jsonb not null default '[]'::jsonb;

comment on column public.assistance_services.who_bullets is
  'JSON array of strings for “Who may avail” on mobile; empty hides the section.';

commit;
