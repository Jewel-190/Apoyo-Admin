-- Web content CMS: a single flexible table that backs the public Apoyo website.
--
-- Design notes:
-- - ONE row per website "page" (page = primary key: 'global' | 'home' | 'services' | 'about').
-- - The entire page payload lives in a single `content` jsonb column, so the
--   shape can evolve freely without further migrations (schema-on-read).
-- - This table is the website's read endpoint: the public site fetches
--   `select content from web_content where page = '<page>'`.
-- - Reads are PUBLIC (anon + authenticated) because the marketing site is
--   unauthenticated. Writes are superadmin-only, enforced by RLS.
-- - updated_at / updated_by are stamped automatically by trigger.
--
-- Non-destructive: only creates a new table + policies; touches nothing else.

begin;

set search_path = public;

-- -- Audit-stamp trigger --------------------------------------------------------
create or replace function public.tg_web_content_stamp_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- -- Table ----------------------------------------------------------------------
create table if not exists public.web_content (
  page        text primary key,
  content     jsonb not null default '{}'::jsonb,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

comment on table public.web_content is
  'Public website content store (superadmin-managed). One row per page; content is an open-ended jsonb payload the marketing site reads directly.';

-- -- Stamp trigger --------------------------------------------------------------
drop trigger if exists web_content_stamp on public.web_content;
create trigger web_content_stamp
  before insert or update on public.web_content
  for each row execute function public.tg_web_content_stamp_row();

-- -- Row Level Security ---------------------------------------------------------
alter table public.web_content enable row level security;

-- Public read: the unauthenticated website needs to render this content.
drop policy if exists web_content_read on public.web_content;
create policy web_content_read on public.web_content
  for select to anon, authenticated
  using (true);

-- Superadmin write only.
drop policy if exists web_content_write on public.web_content;
create policy web_content_write on public.web_content
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

-- -- Grants (RLS still governs row visibility) ----------------------------------
grant select on public.web_content to anon;
grant select, insert, update, delete on public.web_content to authenticated;

-- -- Seed the page rows (idempotent). Payloads start empty; the admin CMS
-- -- publishes full default content on first save (single source of truth for
-- -- defaults lives in the CMS module to avoid schema drift). ------------------
insert into public.web_content (page, content, description) values
  ('global',   '{}'::jsonb, 'Site-wide chrome: navbar, footer, shared contacts, and legal pages (terms/privacy).'),
  ('home',     '{}'::jsonb, 'Home page: hero, slogan, how-it-works, showcase, app download, phone gallery, quick links.'),
  ('services', '{}'::jsonb, 'Services page: hero, category grid, and per-category programs + requirements.'),
  ('about',    '{}'::jsonb, 'About page: hero, partners, pillars, official channels, and closing CTA.')
on conflict (page) do nothing;

commit;
