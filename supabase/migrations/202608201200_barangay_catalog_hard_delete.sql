-- Hard-delete barangay catalog rows without rewriting person records.
-- Voters keep barangay_name snapshots; barangay_id is detached (SET NULL).
-- public.users.barangay is independent text and is never touched.

begin;

set search_path = public;

-- Fill any empty voter snapshots from the catalog name before detaching.
update public.registered_voters rv
set barangay_name = b.name
from public.barangays b
where rv.barangay_id = b.id
  and btrim(coalesce(rv.barangay_name, '')) = '';

alter table public.registered_voters
  alter column barangay_id drop not null;

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
  on delete set null
  on update restrict;

comment on column public.registered_voters.barangay_id is
  'Live catalog pointer when the barangay still exists. Null after catalog removal; barangay_name remains the historical snapshot.';

comment on column public.registered_voters.barangay_name is
  'Name captured when the voter record was written. Survives catalog rename and catalog deletion.';

-- Finish previously soft-removed catalog rows. SET NULL detaches voter FKs; snapshots stay.
delete from public.barangays
where is_active = false;

comment on table public.barangays is
  'Official barangay catalog for new selections. Superadmin may rename or delete rows. Person records keep their own barangay snapshot and are never cascaded.';

commit;
