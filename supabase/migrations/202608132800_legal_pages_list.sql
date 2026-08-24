-- Legal settings become a list of pages. Each page can be shown on the public
-- site (Display at web) independently. Drop the unused updated line.

begin;

update public.settings
set
  value = jsonb_build_object(
    'pages',
    case
      when jsonb_typeof(value -> 'pages') = 'array' then (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', coalesce(nullif(page.page ->> 'id', ''), gen_random_uuid()::text),
              'title', coalesce(nullif(trim(page.page ->> 'title'), ''), 'Untitled'),
              'slug', coalesce(
                nullif(trim(both '-' from lower(regexp_replace(trim(coalesce(page.page ->> 'slug', '')), '[^a-zA-Z0-9]+', '-', 'g'))), ''),
                nullif(trim(both '-' from lower(regexp_replace(trim(coalesce(page.page ->> 'title', 'legal')), '[^a-zA-Z0-9]+', '-', 'g'))), ''),
                'page'
              ),
              'displayAtWeb', coalesce((page.page ->> 'displayAtWeb')::boolean, false),
              'sections', coalesce(page.page -> 'sections', '[]'::jsonb)
            )
            order by page.ord
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(value -> 'pages') with ordinality as page(page, ord)
      )
      else jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'title', coalesce(nullif(trim(value ->> 'title'), ''), 'Legal'),
          'slug', 'legal',
          'displayAtWeb', true,
          'sections', coalesce(value -> 'sections', '[]'::jsonb)
        )
      )
    end
  ),
  description = 'Public Legal pages shown on the website.',
  visibility = 'public',
  updated_at = now()
where scope = 'system'
  and key = 'legal';

commit;
