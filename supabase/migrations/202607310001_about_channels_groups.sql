-- Reshape about.channels from flat mayor/facebook/panteon/cta fields into
-- stackable groups[] of entries. Idempotent: skips rows that already have groups.

update public.web_content
set content = jsonb_set(
  content,
  '{channels}',
  jsonb_build_object(
    'heading', coalesce(content #>> '{channels,heading}', ''),
    'intro', coalesce(content #>> '{channels,intro}', ''),
    'groups', (
      select coalesce(jsonb_agg(grp order by ord), '[]'::jsonb)
      from (
        select 1 as ord, jsonb_build_object(
          'title', 'Office of the City Mayor',
          'entries', (
            select coalesce(jsonb_agg(e order by eord), '[]'::jsonb)
            from (
              select 1 as eord, jsonb_build_object('kind','text','label','Address','body', coalesce(content #>> '{channels,mayorAddress}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,mayorAddress}', '') <> ''
              union all
              select 2, jsonb_build_object('kind','phone','label','Landline','body', coalesce(content #>> '{channels,mayorLandline}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,mayorLandline}', '') <> ''
              union all
              select 3, jsonb_build_object('kind','phone','label','Cellphone','body', coalesce(content #>> '{channels,mayorCell}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,mayorCell}', '') <> ''
              union all
              select 4, jsonb_build_object('kind','email','label','Email · Open in Gmail','body', coalesce(content #>> '{channels,mayorEmail}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,mayorEmail}', '') <> ''
            ) e
          )
        ) as grp
        where exists (
          select 1 where coalesce(content #>> '{channels,mayorAddress}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,mayorLandline}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,mayorCell}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,mayorEmail}', '') <> ''
        )

        union all

        select 2, jsonb_build_object(
          'title', 'City & programs',
          'entries', (
            select coalesce(jsonb_agg(e order by eord), '[]'::jsonb)
            from (
              select 1 as eord, jsonb_build_object(
                'kind','link','label','Facebook',
                'body', coalesce(content #>> '{channels,facebookCityLabel}', ''),
                'href', coalesce(content #>> '{channels,facebookCityUrl}', ''),
                'style','card'
              ) where coalesce(content #>> '{channels,facebookCityUrl}', '') <> ''
              union all
              select 2, jsonb_build_object(
                'kind','link','label','CSWDO',
                'body', coalesce(content #>> '{channels,facebookCswdoLabel}', ''),
                'href', coalesce(content #>> '{channels,facebookCswdoUrl}', ''),
                'style','card'
              ) where coalesce(content #>> '{channels,facebookCswdoUrl}', '') <> ''
            ) e
          )
        )
        where exists (
          select 1 where coalesce(content #>> '{channels,facebookCityUrl}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,facebookCswdoUrl}', '') <> ''
        )

        union all

        select 3, jsonb_build_object(
          'title', 'Panteon / Lafuneraria de Dasmariñas',
          'entries', (
            select coalesce(jsonb_agg(e order by eord), '[]'::jsonb)
            from (
              select 1 as eord, jsonb_build_object('kind','text','label','Address','body', coalesce(content #>> '{channels,panteonAddress}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,panteonAddress}', '') <> ''
              union all
              select 2, jsonb_build_object('kind','phone','label','Smart / TNT','body', coalesce(content #>> '{channels,panteonSmart}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,panteonSmart}', '') <> ''
              union all
              select 3, jsonb_build_object('kind','phone','label','Globe / TM','body', coalesce(content #>> '{channels,panteonGlobe}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,panteonGlobe}', '') <> ''
              union all
              select 4, jsonb_build_object('kind','phone','label','Landline','body', coalesce(content #>> '{channels,panteonLandline}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,panteonLandline}', '') <> ''
              union all
              select 5, jsonb_build_object('kind','email','label','Email · Open in Gmail','body', coalesce(content #>> '{channels,panteonEmail}', ''), 'href', '', 'style', 'card')
                where coalesce(content #>> '{channels,panteonEmail}', '') <> ''
              union all
              select 6, jsonb_build_object(
                'kind','link','label','Facebook',
                'body', coalesce(content #>> '{channels,panteonFacebookLabel}', ''),
                'href', coalesce(content #>> '{channels,panteonFacebookUrl}', ''),
                'style','card'
              ) where coalesce(content #>> '{channels,panteonFacebookUrl}', '') <> ''
            ) e
          )
        )
        where exists (
          select 1 where coalesce(content #>> '{channels,panteonAddress}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,panteonSmart}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,panteonGlobe}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,panteonLandline}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,panteonEmail}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,panteonFacebookUrl}', '') <> ''
        )

        union all

        select 4, jsonb_build_object(
          'title', 'Quick links',
          'entries', (
            select coalesce(jsonb_agg(e order by eord), '[]'::jsonb)
            from (
              select 1 as eord, jsonb_build_object(
                'kind','route','label', coalesce(content #>> '{channels,ctaServicesLabel}', ''),
                'body', '', 'href', coalesce(nullif(content #>> '{channels,ctaServicesRoute}', ''), '/services'),
                'style','primary'
              ) where coalesce(content #>> '{channels,ctaServicesLabel}', '') <> ''
              union all
              select 2, jsonb_build_object(
                'kind','route','label', coalesce(content #>> '{channels,ctaTermsLabel}', ''),
                'body', '', 'href', coalesce(nullif(content #>> '{channels,ctaTermsRoute}', ''), '/terms'),
                'style','secondary'
              ) where coalesce(content #>> '{channels,ctaTermsLabel}', '') <> ''
              union all
              select 3, jsonb_build_object(
                'kind','route','label', coalesce(content #>> '{channels,ctaPrivacyLabel}', ''),
                'body', '', 'href', coalesce(nullif(content #>> '{channels,ctaPrivacyRoute}', ''), '/privacy'),
                'style','secondary'
              ) where coalesce(content #>> '{channels,ctaPrivacyLabel}', '') <> ''
              union all
              select 4, jsonb_build_object(
                'kind','route','label', coalesce(content #>> '{channels,ctaHomeLabel}', ''),
                'body', '', 'href', coalesce(nullif(content #>> '{channels,ctaHomeRoute}', ''), '/'),
                'style','secondary'
              ) where coalesce(content #>> '{channels,ctaHomeLabel}', '') <> ''
            ) e
          )
        )
        where exists (
          select 1 where coalesce(content #>> '{channels,ctaServicesLabel}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,ctaTermsLabel}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,ctaPrivacyLabel}', '') <> ''
          union all select 1 where coalesce(content #>> '{channels,ctaHomeLabel}', '') <> ''
        )
      ) g
    )
  ),
  true
)
where page = 'about'
  and content ? 'channels'
  and jsonb_typeof(content -> 'channels' -> 'groups') is distinct from 'array';
