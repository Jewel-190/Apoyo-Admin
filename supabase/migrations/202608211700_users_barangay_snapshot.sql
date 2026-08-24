-- Applicant profile barangay snapshot.
-- Independent of registered_voters and of barangay catalog hard-delete.
-- Superadmin Users → Edit profile writes this column; the voters directory is not rewritten.

begin;

set search_path = public;

alter table public.users
  add column if not exists barangay text not null default '';

comment on column public.users.barangay is
  'Applicant profile barangay name snapshot. Independent of registered_voters.barangay_name and of the barangays catalog.';

update public.users u
set barangay = rv.barangay_name
from public.registered_voters rv
where btrim(u.barangay) = ''
  and btrim(coalesce(rv.barangay_name, '')) <> ''
  and (
    u.registered_voter_id = rv.id
    or (
      u.voter_id_number is not null
      and u.voter_id_number = rv.voter_id
    )
  );

commit;
