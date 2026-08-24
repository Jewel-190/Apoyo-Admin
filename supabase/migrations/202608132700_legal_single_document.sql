-- Flatten Legal settings to a single document (former Terms payload).
-- Drop Privacy Policy and About CMS Quick links (now hardcoded on the public site).

begin;

update public.settings
set
  value = jsonb_build_object(
    'title',
    case
      when nullif(
        trim(coalesce(value #>> '{terms,title}', value ->> 'title', '')),
        ''
      ) is null
        or trim(coalesce(value #>> '{terms,title}', value ->> 'title', ''))
          in ('Terms & Conditions', 'Terms and Conditions')
      then 'Legal'
      else trim(coalesce(value #>> '{terms,title}', value ->> 'title', ''))
    end,
    'updated',
    coalesce(value #>> '{terms,updated}', value ->> 'updated', ''),
    'sections',
    coalesce(value #> '{terms,sections}', value -> 'sections', '[]'::jsonb)
  ),
  description = 'Public Legal page shown on the website.',
  visibility = 'public',
  updated_at = now()
where scope = 'system'
  and key = 'legal';

update public.web_content
set content = jsonb_set(
  content,
  '{channels,groups}',
  coalesce(
    (
      select jsonb_agg(group_el)
      from jsonb_array_elements(coalesce(content #> '{channels,groups}', '[]'::jsonb)) as group_el
      where coalesce(group_el ->> 'id', '') <> 'quickLinks'
        and lower(trim(coalesce(group_el ->> 'title', ''))) <> 'quick links'
    ),
    '[]'::jsonb
  )
)
where page = 'about'
  and content #> '{channels,groups}' is not null;

commit;
