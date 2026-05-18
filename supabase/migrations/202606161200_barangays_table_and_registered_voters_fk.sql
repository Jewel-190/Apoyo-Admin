-- Barangay reference table + registered_voters.barangay_id FK (replaces text + CHECK list).

begin;

set search_path = public;

create table if not exists public.barangays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  constraint barangays_name_unique unique (name)
);

comment on table public.barangays is
  'Official Dasmariñas City barangays for registered_voters.barangay_id.';

insert into public.barangays (name)
values
  ('Burol'),
  ('Burol I'),
  ('Burol II'),
  ('Burol III'),
  ('Datu Esmael'),
  ('Emmanuel Bergado I'),
  ('Emmanuel Bergado II'),
  ('Fatima I'),
  ('Fatima II'),
  ('Fatima III'),
  ('H-2'),
  ('Langkaan I'),
  ('Langkaan II'),
  ('Luzviminda I'),
  ('Luzviminda II'),
  ('Paliparan I'),
  ('Paliparan II'),
  ('Paliparan III'),
  ('Sabang'),
  ('Saint Peter I'),
  ('Saint Peter II'),
  ('Salawag'),
  ('Salitran I'),
  ('Salitran II'),
  ('Salitran III'),
  ('Salitran IV'),
  ('Sampaloc I'),
  ('Sampaloc II'),
  ('Sampaloc III'),
  ('Sampaloc IV'),
  ('Sampaloc V'),
  ('San Agustin I'),
  ('San Agustin II'),
  ('San Agustin III'),
  ('San Andres I'),
  ('San Andres II'),
  ('San Antonio de Padua I'),
  ('San Antonio de Padua II'),
  ('San Dionisio'),
  ('San Esteban'),
  ('San Francisco I'),
  ('San Francisco II'),
  ('San Isidro Labrador I'),
  ('San Isidro Labrador II'),
  ('San Jose'),
  ('San Juan'),
  ('San Lorenzo Ruiz I'),
  ('San Lorenzo Ruiz II'),
  ('San Luis I'),
  ('San Luis II'),
  ('San Manuel I'),
  ('San Manuel II'),
  ('San Mateo'),
  ('San Miguel'),
  ('San Miguel II'),
  ('San Nicolas I'),
  ('San Nicolas II'),
  ('San Roque'),
  ('San Simon'),
  ('Santa Cristina I'),
  ('Santa Cristina II'),
  ('Santa Cruz I'),
  ('Santa Cruz II'),
  ('Santa Fe'),
  ('Santa Lucia'),
  ('Santa Maria'),
  ('Santo Cristo'),
  ('Santo Niño I'),
  ('Santo Niño II'),
  ('Victoria Reyes'),
  ('Zone I'),
  ('Zone I-B'),
  ('Zone II'),
  ('Zone III'),
  ('Zone IV')
on conflict (name) do nothing;

-- Legacy free-text cleanup (same as prior migration) before FK backfill
update public.registered_voters set barangay = 'Santa Cristina I' where barangay in ('Sta. Cristina I', 'sta. cristina i', 'Sta Cristina I');
update public.registered_voters set barangay = 'Santa Cristina II' where barangay in ('Sta. Cristina II', 'sta. cristina ii', 'Sta Cristina II');
update public.registered_voters set barangay = 'San Miguel' where barangay in ('San Miguel I', 'san miguel i');
update public.registered_voters set barangay = 'Zone I' where barangay in ('Zone I-A', 'zone i-a', 'Zone I A');

alter table public.registered_voters
  add column if not exists barangay_id uuid references public.barangays (id);

update public.registered_voters rv
set barangay_id = b.id
from public.barangays b
where rv.barangay_id is null
  and trim(rv.barangay) = b.name;

-- Fail fast if any row could not be mapped
do $$
begin
  if exists (select 1 from public.registered_voters where barangay_id is null) then
    raise exception 'registered_voters: unmapped barangay text remains; fix data before applying FK migration';
  end if;
end $$;

alter table public.registered_voters
  drop constraint if exists registered_voters_barangay_valid;

drop function if exists public.registered_voters_barangay_is_valid(text);

drop index if exists public.registered_voters_barangay_idx;

alter table public.registered_voters
  drop column if exists barangay;

alter table public.registered_voters
  alter column barangay_id set not null;

create index if not exists registered_voters_barangay_id_idx
  on public.registered_voters (barangay_id);

alter table public.barangays enable row level security;

drop policy if exists barangays_select_authenticated on public.barangays;
create policy barangays_select_authenticated on public.barangays
  for select
  to authenticated
  using (true);

grant select on public.barangays to authenticated;

commit;
