-- Remove unused placeholder settings rows seeded before modules were built.
-- Keep only the implemented Logo & Banner mini-CMS row.

begin;

delete from public.settings
where not (scope = 'system' and key = 'logo-and-banner');

-- Ensure the kept row still exists with the expected public visibility.
insert into public.settings (scope, key, value, description, visibility)
values (
  'system',
  'logo-and-banner',
  '{
    "apoyo_logo_url": "",
    "apoyo_banner_url": "",
    "dasma_logo_url": "",
    "dasma_banner_url": ""
  }'::jsonb,
  'Platform logo and banner assets for admin, superadmin, and login chrome.',
  'public'
)
on conflict (scope, key) do update
  set description = excluded.description,
      visibility = 'public',
      updated_at = now();

commit;
