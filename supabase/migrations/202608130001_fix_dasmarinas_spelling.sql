-- Correct settings description spelling to Dasmariñas.

begin;

update public.settings
set
  description = 'Dasmariñas logo and banner assets for admin, superadmin, and login chrome.',
  updated_at = now()
where scope = 'system'
  and key = 'logo-and-banner';

commit;
