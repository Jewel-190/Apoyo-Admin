-- Keep barangay names unique regardless of casing/whitespace.
-- Writes stay on the service role (edge function); authenticated clients remain SELECT-only.

begin;

set search_path = public;

update public.barangays
set name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
where name is distinct from btrim(regexp_replace(name, '\s+', ' ', 'g'));

delete from public.barangays a
using public.barangays b
where a.id > b.id
  and lower(a.name) = lower(b.name)
  and not exists (
    select 1 from public.registered_voters rv where rv.barangay_id = a.id
  );

create unique index if not exists barangays_name_lower_uidx
  on public.barangays (lower(name));

comment on table public.barangays is
  'Official Dasmariñas City barangays. Superadmin configures rows; registered_voters.barangay_id references this table.';

commit;
