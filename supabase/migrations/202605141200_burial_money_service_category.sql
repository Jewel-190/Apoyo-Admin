-- Reassign monetary burial aid to the burial assistance category (catalog truth).

begin;

set search_path = public;

update public.assistance_services s
set
  category_id = c.id,
  updated_at = coalesce(s.updated_at, now())
from public.assistance_categories c
where s.service_key = 'burial-money'
  and c.slug = 'burial';

commit;
