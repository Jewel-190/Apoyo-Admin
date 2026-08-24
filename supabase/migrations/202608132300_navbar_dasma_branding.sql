-- Navbar Apoyo logo is locked in public-site code.
-- Map leftover secondary logo into Dasmariñas Logo, then drop legacy keys.

begin;

update public.web_content
set content = jsonb_set(
  content,
  '{navbar}',
  (
    (
      coalesce(content -> 'navbar', '{}'::jsonb)
      - 'logoPrimary'
      - 'logoPrimaryAlt'
      - 'logoSecondary'
      - 'logoSecondaryAlt'
      - 'links'
    )
    || jsonb_strip_nulls(
      jsonb_build_object(
        'dasmaLogo',
        nullif(
          coalesce(
            nullif(content #>> '{navbar,dasmaLogo}', ''),
            nullif(content #>> '{navbar,logoSecondary}', '')
          ),
          ''
        ),
        'dasmaLogoAlt',
        nullif(
          coalesce(
            nullif(content #>> '{navbar,dasmaLogoAlt}', ''),
            nullif(content #>> '{navbar,logoSecondaryAlt}', '')
          ),
          ''
        )
      )
    )
  )
)
where page = 'global'
  and content ? 'navbar';

commit;
