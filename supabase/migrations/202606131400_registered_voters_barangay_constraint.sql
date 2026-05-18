begin;

set search_path = public;

-- Align legacy free-text values with official names before CHECK
update public.registered_voters set barangay = 'Santa Cristina I' where barangay in ('Sta. Cristina I');
update public.registered_voters set barangay = 'Santa Cristina II' where barangay in ('Sta. Cristina II');
update public.registered_voters set barangay = 'San Miguel' where barangay = 'San Miguel I';
update public.registered_voters set barangay = 'Zone I' where barangay = 'Zone I-A';

create or replace function public.registered_voters_barangay_is_valid(p text)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select coalesce(trim(p), '') <> ''
    and trim(p) = any (
      array[
        'Burol'::text,
        'Burol I'::text,
        'Burol II'::text,
        'Burol III'::text,
        'Datu Esmael'::text,
        'Emmanuel Bergado I'::text,
        'Emmanuel Bergado II'::text,
        'Fatima I'::text,
        'Fatima II'::text,
        'Fatima III'::text,
        'H-2'::text,
        'Langkaan I'::text,
        'Langkaan II'::text,
        'Luzviminda I'::text,
        'Luzviminda II'::text,
        'Paliparan I'::text,
        'Paliparan II'::text,
        'Paliparan III'::text,
        'Sabang'::text,
        'Saint Peter I'::text,
        'Saint Peter II'::text,
        'Salawag'::text,
        'Salitran I'::text,
        'Salitran II'::text,
        'Salitran III'::text,
        'Salitran IV'::text,
        'Sampaloc I'::text,
        'Sampaloc II'::text,
        'Sampaloc III'::text,
        'Sampaloc IV'::text,
        'Sampaloc V'::text,
        'San Agustin I'::text,
        'San Agustin II'::text,
        'San Agustin III'::text,
        'San Andres I'::text,
        'San Andres II'::text,
        'San Antonio de Padua I'::text,
        'San Antonio de Padua II'::text,
        'San Dionisio'::text,
        'San Esteban'::text,
        'San Francisco I'::text,
        'San Francisco II'::text,
        'San Isidro Labrador I'::text,
        'San Isidro Labrador II'::text,
        'San Jose'::text,
        'San Juan'::text,
        'San Lorenzo Ruiz I'::text,
        'San Lorenzo Ruiz II'::text,
        'San Luis I'::text,
        'San Luis II'::text,
        'San Manuel I'::text,
        'San Manuel II'::text,
        'San Mateo'::text,
        'San Miguel'::text,
        'San Miguel II'::text,
        'San Nicolas I'::text,
        'San Nicolas II'::text,
        'San Roque'::text,
        'San Simon'::text,
        'Santa Cristina I'::text,
        'Santa Cristina II'::text,
        'Santa Cruz I'::text,
        'Santa Cruz II'::text,
        'Santa Fe'::text,
        'Santa Lucia'::text,
        'Santa Maria'::text,
        'Santo Cristo'::text,
        'Santo Niño I'::text,
        'Santo Niño II'::text,
        'Victoria Reyes'::text,
        'Zone I'::text,
        'Zone I-B'::text,
        'Zone II'::text,
        'Zone III'::text,
        'Zone IV'::text
      ]
    );
$$;

alter table public.registered_voters
  drop constraint if exists registered_voters_barangay_valid;

alter table public.registered_voters
  add constraint registered_voters_barangay_valid
  check (public.registered_voters_barangay_is_valid(barangay));

comment on function public.registered_voters_barangay_is_valid(text) is
  'True when barangay is an official Dasmariñas City barangay (registered_voters).';

commit;
