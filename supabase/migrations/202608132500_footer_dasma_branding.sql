-- Footer logo is Dasmariñas branding: map leftover single logo into
-- Dasmariñas Logo, then drop the legacy keys.

begin;

update public.web_content
set content = jsonb_set(
  content,
  '{footer}',
  (
    (
      coalesce(content -> 'footer', '{}'::jsonb)
      - 'logo'
      - 'logoAlt'
    )
    || jsonb_strip_nulls(
      jsonb_build_object(
        'dasmaLogo',
        nullif(
          coalesce(
            nullif(content #>> '{footer,dasmaLogo}', ''),
            nullif(content #>> '{footer,logo}', '')
          ),
          ''
        ),
        'dasmaLogoAlt',
        nullif(
          coalesce(
            nullif(content #>> '{footer,dasmaLogoAlt}', ''),
            nullif(content #>> '{footer,logoAlt}', '')
          ),
          ''
        )
      )
    )
  )
)
where page = 'global'
  and content ? 'footer';

commit;
