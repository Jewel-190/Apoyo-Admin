-- The former single Legal document was wrapped with slug "legal". Prefer a
-- title-derived slug so About Quick links use a stable, readable URL.

begin;

update public.settings
set
  value = jsonb_set(
    value,
    '{pages}',
    coalesce(
      (
        select jsonb_agg(
          case
            when coalesce(page ->> 'slug', '') in ('', 'legal', 'page') then
              jsonb_set(
                page,
                '{slug}',
                to_jsonb(
                  coalesce(
                    nullif(
                      trim(both '-' from lower(regexp_replace(trim(coalesce(page ->> 'title', '')), '[^a-zA-Z0-9]+', '-', 'g'))),
                      ''
                    ),
                    coalesce(nullif(page ->> 'slug', ''), 'page')
                  )
                )
              )
            else page
          end
          order by ord
        )
        from jsonb_array_elements(coalesce(value -> 'pages', '[]'::jsonb))
          with ordinality as t(page, ord)
      ),
      '[]'::jsonb
    )
  ),
  updated_at = now()
where scope = 'system'
  and key = 'legal';

commit;
