-- Public Services page: reshape web_content.services to presentation overlays only,
-- and document/ensure anon+authenticated can read active assistance catalog rows.

begin;

set search_path = public;

-- ---------------------------------------------------------------------------
-- Public read of active catalog (idempotent). Marketing site needs this.
-- ---------------------------------------------------------------------------

alter table if exists public.assistance_categories enable row level security;
alter table if exists public.assistance_services enable row level security;
alter table if exists public.assistance_requirements enable row level security;

drop policy if exists assistance_categories_public_read_active on public.assistance_categories;
create policy assistance_categories_public_read_active
  on public.assistance_categories
  for select
  to anon, authenticated
  using (active is true);

drop policy if exists assistance_services_public_read_active on public.assistance_services;
create policy assistance_services_public_read_active
  on public.assistance_services
  for select
  to anon, authenticated
  using (active is true);

drop policy if exists assistance_requirements_public_read_for_active_services
  on public.assistance_requirements;
create policy assistance_requirements_public_read_for_active_services
  on public.assistance_requirements
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.assistance_services s
      where s.id = assistance_requirements.service_id
        and s.active is true
    )
  );

grant select on public.assistance_categories to anon, authenticated;
grant select on public.assistance_services to anon, authenticated;
grant select on public.assistance_requirements to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reshape web_content.services → { presentations: [...] }
-- Preserve image / location / link fields; drop duplicated programs + chrome.
-- ---------------------------------------------------------------------------

update public.web_content
set content = coalesce(
  (
    select jsonb_build_object(
      'presentations',
      coalesce(
        jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'catalogSlug', coalesce(cat->>'id', cat->>'catalogSlug'),
              'infoLink', coalesce(cat->>'infoLink', ''),
              'infoLabel', coalesce(cat->>'infoLabel', ''),
              'locationLabel', coalesce(cat->>'locationLabel', ''),
              'locationAddress', coalesce(cat->>'locationAddress', ''),
              'lat', cat->'lat',
              'lng', cat->'lng',
              'imagesSide', coalesce(nullif(cat->>'imagesSide', ''), 'left'),
              'imagesLayout', coalesce(nullif(cat->>'imagesLayout', ''), 'three'),
              'imageMain', coalesce(cat->>'imageMain', ''),
              'imageSub1', coalesce(cat->>'imageSub1', ''),
              'imageSub2', coalesce(cat->>'imageSub2', '')
            )
          )
          order by ordinality
        ),
        '[]'::jsonb
      )
    )
    from jsonb_array_elements(
      case
        when jsonb_typeof(content->'presentations') = 'array' then content->'presentations'
        when jsonb_typeof(content->'categories') = 'array' then content->'categories'
        else '[]'::jsonb
      end
    ) with ordinality as t(cat, ordinality)
    where coalesce(nullif(cat->>'id', ''), nullif(cat->>'catalogSlug', '')) is not null
  ),
  '{"presentations":[]}'::jsonb
),
description = 'Services page: per-category facility images, location preview, and external link (programs come from the live assistance catalog).'
where page = 'services'
  and (
    content ? 'categories'
    or content ? 'hero'
    or content ? 'grid'
    or content ? 'detailStrings'
    or not (content ? 'presentations')
  );

commit;
