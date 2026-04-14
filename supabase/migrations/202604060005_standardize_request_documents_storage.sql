-- Standardize attachment storage to a single source of truth.
-- Bucket: request-documents
-- request_attachments.path: object path only (no URL, no bucket prefix)

insert into storage.buckets (id, name, public)
values ('request-documents', 'request-documents', true)
on conflict (id)
do update set
  name = excluded.name,
  public = true;

-- Normalize path values in-place.
update public.request_attachments
set path = nullif(btrim(path), '')
where path is not null;

update public.request_attachments
set path = split_part(path, '?', 1)
where path is not null
  and strpos(path, '?') > 0;

update public.request_attachments
set path = regexp_replace(
  path,
  '^https?://[^/]+/storage/v1/object/(public|sign)/[^/]+/',
  '',
  'i'
)
where path is not null
  and path ~* '^https?://';

update public.request_attachments
set path = regexp_replace(
  path,
  '^/?storage/v1/object/(public|sign)/[^/]+/',
  '',
  'i'
)
where path is not null
  and path ~* '^/?storage/v1/object/(public|sign)/';

update public.request_attachments
set path = regexp_replace(path, '^/+', '', 'g')
where path is not null
  and path ~ '^/+';

update public.request_attachments
set path = regexp_replace(path, '^request-documents/', '', 'i')
where path is not null
  and path ~* '^request-documents/';

update public.request_attachments
set path = regexp_replace(
  path,
  '^(hospitalization-documents|treatment-documents|medical-documents|financial-documents|monetary-documents|burial-documents|cremation-documents|columbarium-documents)/',
  '',
  'i'
)
where path is not null
  and path ~* '^(hospitalization-documents|treatment-documents|medical-documents|financial-documents|monetary-documents|burial-documents|cremation-documents|columbarium-documents)/';

-- Enforce path format moving forward.
do $$
declare
  v_table regclass := to_regclass('public.request_attachments');
begin
  if v_table is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'request_attachments_path_object_path_check'
         and conrelid = v_table
     ) then
    alter table public.request_attachments
      add constraint request_attachments_path_object_path_check
      check (
        path is null
        or (
          btrim(path) <> ''
          and path !~* '^https?://'
          and path !~* '^/?storage/v1/object/'
          and path !~* '^request-documents/'
          and path !~* '^(hospitalization-documents|treatment-documents|medical-documents|financial-documents|monetary-documents|burial-documents|cremation-documents|columbarium-documents)/'
        )
      );
  end if;
end
$$;
