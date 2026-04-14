alter table if exists public.request_attachments
  add column if not exists reason_for_action text,
  add column if not exists additional_reason varchar(500);

do $$
declare
  v_table regclass := to_regclass('public.request_attachments');
begin
  if v_table is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'request_attachments_reason_for_action_check'
         and conrelid = v_table
     ) then
    alter table public.request_attachments
      add constraint request_attachments_reason_for_action_check
      check (
        reason_for_action is null
        or reason_for_action in (
          'Blurry',
          'Tampered/Photoshopped',
          'Expired',
          'Name Mismatch',
          'Wrong document'
        )
      );
  end if;
end
$$;
