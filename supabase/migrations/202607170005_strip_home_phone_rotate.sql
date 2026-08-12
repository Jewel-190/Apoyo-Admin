-- Remove unused phone tilt (`rotate`) from home CMS content.
-- Non-destructive for the rest of the payload; only drops that key from each phones.items entry.

begin;

update public.web_content
set content = jsonb_set(
  content,
  '{phones,items}',
  coalesce(
    (
      select jsonb_agg(elem - 'rotate')
      from jsonb_array_elements(coalesce(content #> '{phones,items}', '[]'::jsonb)) as t(elem)
    ),
    '[]'::jsonb
  )
)
where page = 'home'
  and content #> '{phones,items}' is not null;

commit;
