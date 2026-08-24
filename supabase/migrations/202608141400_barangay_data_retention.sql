-- Data retention for barangay catalog changes.
-- Person records keep a name snapshot. Catalog retire is soft-delete (is_active).
-- Renames and retires never cascade into public.users or registered_voters.

begin;

set search_path = public;

alter table public.barangays
  add column if not exists is_active boolean not null default true;

comment on column public.barangays.is_active is
  'When false the barangay is retired from new picks. Existing voter/user records are left unchanged.';

alter table public.registered_voters
  add column if not exists barangay_name text;

update public.registered_voters rv
set barangay_name = b.name
from public.barangays b
where rv.barangay_name is null
  and rv.barangay_id = b.id;

update public.registered_voters
set barangay_name = ''
where barangay_name is null;

alter table public.registered_voters
  alter column barangay_name set default '',
  alter column barangay_name set not null;

comment on column public.registered_voters.barangay_name is
  'Name captured when the voter record was written. Catalog renames do not overwrite this.';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.registered_voters'::regclass
      and conname = 'registered_voters_barangay_id_fkey'
  ) then
    alter table public.registered_voters
      drop constraint registered_voters_barangay_id_fkey;
  end if;
end $$;

alter table public.registered_voters
  add constraint registered_voters_barangay_id_fkey
  foreign key (barangay_id) references public.barangays (id)
  on delete restrict
  on update restrict;

comment on table public.barangays is
  'Official barangay catalog. Superadmin may rename or retire rows; person records keep their own barangay snapshot and are never cascaded.';

commit;
