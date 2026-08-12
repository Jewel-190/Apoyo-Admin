-- Fix about.channels.groups entries accidentally stored as
-- { "eord": N, "jsonb_build_object": { ...actual entry... } }
-- Unwrap to the plain entry objects the CMS and website expect.

update public.web_content
set content = jsonb_set(
  content,
  '{channels,groups}',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'title', coalesce(g->>'title', ''),
          'entries', coalesce(
            (
              select jsonb_agg(
                case
                  when jsonb_typeof(e->'jsonb_build_object') = 'object'
                    then e->'jsonb_build_object'
                  else e - 'eord'
                end
                order by coalesce((e->>'eord')::int, ordinality)
              )
              from jsonb_array_elements(coalesce(g->'entries', '[]'::jsonb))
                with ordinality as t(e, ordinality)
            ),
            '[]'::jsonb
          )
        )
        order by ordinality
      )
      from jsonb_array_elements(coalesce(content->'channels'->'groups', '[]'::jsonb))
        with ordinality as t(g, ordinality)
    ),
    '[]'::jsonb
  ),
  true
)
where page = 'about'
  and content ? 'channels'
  and jsonb_typeof(content->'channels'->'groups') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(content->'channels'->'groups') g,
         jsonb_array_elements(coalesce(g->'entries', '[]'::jsonb)) e
    where e ? 'jsonb_build_object'
  );
