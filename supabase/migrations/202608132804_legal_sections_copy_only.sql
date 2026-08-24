-- Legal settings persist section copy only. Title, slug, flags, and extra
-- keys are application constants and must not remain in public.settings.

begin;

update public.settings
set
  value = jsonb_build_object(
    'sections',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'heading', coalesce(section ->> 'heading', ''),
            'body', coalesce(section ->> 'body', '')
          )
          order by ord
        )
        from jsonb_array_elements(
          coalesce(
            value -> 'sections',
            (
              select page -> 'sections'
              from jsonb_array_elements(coalesce(value -> 'pages', '[]'::jsonb)) as page
              where lower(coalesce(page ->> 'slug', '')) in ('terms-and-conditions', 'legal', 'terms')
                or lower(coalesce(page ->> 'title', '')) like '%terms%'
              limit 1
            ),
            value -> 'pages' -> 0 -> 'sections',
            '[]'::jsonb
          )
        ) with ordinality as t(section, ord)
      ),
      '[]'::jsonb
    )
  ),
  description = 'Public Terms and Conditions section copy.',
  visibility = 'public',
  updated_at = now()
where scope = 'system'
  and key = 'legal';

commit;
