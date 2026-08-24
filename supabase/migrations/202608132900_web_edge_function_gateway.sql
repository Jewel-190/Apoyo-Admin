-- Web content is served and published only through the `web` edge function.
-- PostgREST table access is revoked so clients cannot bypass canonicalize /
-- superadmin checks. Public images still load from the web-content bucket.

begin;

set search_path = public;

-- Service-role upserts set updated_by explicitly; keep that value.
create or replace function public.tg_web_content_stamp_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.updated_by is null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke select, insert, update, delete on public.web_content from anon;
revoke select, insert, update, delete on public.web_content from authenticated;

drop policy if exists web_content_read on public.web_content;
drop policy if exists web_content_write on public.web_content;

comment on table public.web_content is
  'Public website content store. Read/write only via the `web` edge function (service role). One row per page.';

commit;
