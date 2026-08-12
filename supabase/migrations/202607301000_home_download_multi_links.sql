-- Migrate home.download from single store badge fields to multi-link `links[]`.
-- Preserves existing badgeImage / storeHref / badgeAlt as the first link when
-- links is missing or empty. Removes legacy keys afterward.

update public.web_content
set content = jsonb_set(
  content,
  '{download}',
  (
    coalesce(content -> 'download', '{}'::jsonb)
    - 'badgeImage'
    - 'badgeAlt'
    - 'storeHref'
  ) || jsonb_build_object(
    'links',
    case
      when jsonb_typeof(content -> 'download' -> 'links') = 'array'
        and jsonb_array_length(content -> 'download' -> 'links') > 0
        then content -> 'download' -> 'links'
      when coalesce(content #>> '{download,badgeImage}', '') <> ''
        or coalesce(content #>> '{download,storeHref}', '') <> ''
        then jsonb_build_array(
          jsonb_build_object(
            'label', 'App store',
            'image', coalesce(content #>> '{download,badgeImage}', ''),
            'alt', coalesce(content #>> '{download,badgeAlt}', ''),
            'href', coalesce(content #>> '{download,storeHref}', '')
          )
        )
      else coalesce(content -> 'download' -> 'links', '[]'::jsonb)
    end
  ),
  true
)
where page = 'home'
  and content ? 'download';
