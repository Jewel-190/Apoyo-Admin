-- Rich-text "About" copy for assistance services (mobile request info / detail).

begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists about_html text not null default '';

comment on column public.assistance_services.about_html is
  'HTML about/overview copy for the service (CMS rich text). Distinct from description_html.';

commit;
