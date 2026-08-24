-- Primary nav is locked in the public site code, not CMS content.
-- Strip any previously seeded or edited navbar.links from site-wide web_content.

begin;

update public.web_content
set content = content #- '{navbar,links}'
where page = 'global'
  and content ? 'navbar'
  and (content -> 'navbar') ? 'links';

commit;
