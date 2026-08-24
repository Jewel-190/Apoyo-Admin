-- Collapse Legal settings to a single hardcoded Terms and Conditions page.
-- Only section copy is stored; title/slug/visibility live in application code.

begin;

update public.settings
set
  value = jsonb_build_object(
    'sections',
    coalesce(
      (
        select page -> 'sections'
        from jsonb_array_elements(coalesce(value -> 'pages', '[]'::jsonb)) as page
        where lower(coalesce(page ->> 'slug', '')) in ('terms-and-conditions', 'legal', 'terms')
          or lower(coalesce(page ->> 'title', '')) like '%terms%'
        limit 1
      ),
      value -> 'pages' -> 0 -> 'sections',
      value -> 'sections',
      '[]'::jsonb
    )
  ),
  description = 'Public Terms and Conditions shown on the website.',
  visibility = 'public',
  updated_at = now()
where scope = 'system'
  and key = 'legal';

commit;
