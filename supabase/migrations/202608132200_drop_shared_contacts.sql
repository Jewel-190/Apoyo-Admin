-- Shared contacts was unused on the public site. Official contact copy lives
-- on the About page (channels). Drop the leftover site-wide blob.

begin;

update public.web_content
set content = content - 'contacts'
where page = 'global'
  and content ? 'contacts';

commit;
