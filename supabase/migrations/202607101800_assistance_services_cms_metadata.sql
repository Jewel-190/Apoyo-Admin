-- Adds optional CMS-only metadata column on assistance_services so the
-- web admin Content Management UI can persist fields that the mobile app
-- does not consume directly (rich-text font families, sample document
-- preview, web-only hero/map/office title overrides).
--
-- Mobile reads other columns directly; this column is admin-only.
-- Additive only — no existing rows or relations change behavior.

begin;

set search_path = public;

alter table public.assistance_services
  add column if not exists cms_metadata jsonb not null default '{}'::jsonb;

comment on column public.assistance_services.cms_metadata is
  'Admin CMS-only metadata (JSON). Keys: descriptionFontFamily, reminderFontFamily, sampleDocumentImage, sampleDocumentName, webHeroImage, webMapLink, webOfficeTitle. Mobile app ignores this column.';

commit;
