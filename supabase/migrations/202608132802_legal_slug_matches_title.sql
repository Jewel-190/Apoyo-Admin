-- Keep each Legal page URL in sync with its title (e.g. Terms and Conditions
-- → /legal/terms-and-conditions instead of /legal/legal).

begin;

update public.settings
set
  value = jsonb_set(
    value,
    '{pages}',
    coalesce(
      (
        select jsonb_agg(
          jsonb_set(
            page,
            '{slug}',
            to_jsonb(
              coalesce(
                nullif(
                  trim(both '-' from lower(regexp_replace(trim(coalesce(page ->> 'title', '')), '[^a-zA-Z0-9]+', '-', 'g'))),
                  ''
                ),
                'page'
              )
            )
          )
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
