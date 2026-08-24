-- Split Legal settings into hardcoded pages. Only section copy is stored
-- under each page slug. User Acceptance is primed empty for fetching.

begin;

update public.settings
set
  value = jsonb_build_object(
    'terms-and-conditions',
    jsonb_build_object(
      'sections',
      coalesce(
        value -> 'terms-and-conditions' -> 'sections',
        value -> 'sections',
        '[]'::jsonb
      )
    ),
    'user-acceptance',
    jsonb_build_object(
      'sections',
      coalesce(
        value -> 'user-acceptance' -> 'sections',
        '[]'::jsonb
      )
    )
  ),
  description = 'Public Legal page section copy.',
  visibility = 'public',
  updated_at = now()
where scope = 'system'
  and key = 'legal';

commit;
