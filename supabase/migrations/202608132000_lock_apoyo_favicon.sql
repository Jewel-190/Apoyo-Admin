-- Favicon is a locked Apoyo product asset, not CMS content.
-- Strip any previously uploaded or seeded URL from site-wide web_content.

begin;

update public.web_content
set content = content #- '{site,favicon}'
where page = 'global'
  and content ? 'site'
  and (content -> 'site') ? 'favicon';

commit;
