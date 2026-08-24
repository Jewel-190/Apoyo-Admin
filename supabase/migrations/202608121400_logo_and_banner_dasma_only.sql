-- Keep only Dasmarinas fields in logo-and-banner settings.
-- Apoyo branding is now hardcoded in the app and no longer CMS-editable.

begin;

update public.settings
set
  value = jsonb_build_object(
    'dasma_logo_url', coalesce(value ->> 'dasma_logo_url', ''),
    'dasma_banner_url', coalesce(value ->> 'dasma_banner_url', '')
  ),
  description = 'Dasmarinas logo and banner assets for admin, superadmin, and login chrome.',
  updated_at = now()
where scope = 'system'
  and key = 'logo-and-banner';

commit;
