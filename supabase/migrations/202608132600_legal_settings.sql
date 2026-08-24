-- Move Terms & Privacy from web_content into public.settings (system / legal).
-- Public-readable so ApoyoWeb can fetch the same row the Service Settings editor writes.

begin;

insert into public.settings (scope, key, value, description, visibility)
select
  'system',
  'legal',
  jsonb_build_object(
    'terms', coalesce(content -> 'terms', '{}'::jsonb),
    'privacy', coalesce(content -> 'privacy', '{}'::jsonb)
  ),
  'Terms & Conditions and Privacy Policy shown on the public website.',
  'public'
from public.web_content
where page = 'legal'
on conflict (scope, key) do update
  set description = excluded.description,
      visibility = 'public',
      is_active = true,
      updated_at = now();

insert into public.settings (scope, key, value, description, visibility)
values (
  'system',
  'legal',
  '{
    "terms": {
      "title": "",
      "updated": "",
      "secondaryLinkLabel": "",
      "secondaryLinkTo": "/privacy",
      "sections": []
    },
    "privacy": {
      "title": "",
      "updated": "",
      "secondaryLinkLabel": "",
      "secondaryLinkTo": "/terms",
      "sections": []
    }
  }'::jsonb,
  'Terms & Conditions and Privacy Policy shown on the public website.',
  'public'
)
on conflict (scope, key) do nothing;

delete from public.web_content
where page = 'legal';

commit;
