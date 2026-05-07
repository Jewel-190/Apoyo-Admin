-- Add `scheduled` status (between `for approval` and `approved`) on all eight
-- request tables. Backfill rows that already have an interview time saved.

do $$
declare
  tbl text;
  r record;
  tables text[] := array[
    'hospitalization_requests',
    'treatment_requests',
    'medical_requests',
    'financial_requests',
    'monetary_requests',
    'burial_requests',
    'cremation_requests',
    'columbarium_requests'
  ];
begin
  foreach tbl in array tables
  loop
    for r in
      select c.conname
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = tbl
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%status%'
    loop
      execute format('alter table public.%I drop constraint if exists %I', tbl, r.conname);
    end loop;

    execute format(
      $sql$
        update public.%I
        set status = 'scheduled'
        where case_study_date is not null
          and lower(trim(status)) = 'for approval'
      $sql$,
      tbl
    );

    execute format(
      $sql$
        alter table public.%I
        add constraint %I_status_check check (
          status = any (
            array[
              'draft'::text,
              'pending'::text,
              'in progress'::text,
              'action required'::text,
              'resubmitted'::text,
              'for approval'::text,
              'scheduled'::text,
              'approved'::text
            ]
          )
        )
      $sql$,
      tbl,
      tbl
    );
  end loop;
end $$;
