-- Navbar search placeholder and menu aria copy are locked in public-site code.

begin;

update public.web_content
set content = jsonb_set(
  content,
  '{navbar}',
  coalesce(content -> 'navbar', '{}'::jsonb)
    - 'searchPlaceholder'
    - 'openMenuAria'
    - 'closeMenuAria'
)
where page = 'global'
  and content ? 'navbar';

commit;
