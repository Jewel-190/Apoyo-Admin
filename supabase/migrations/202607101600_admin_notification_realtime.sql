-- Enable Realtime for admin_notification (per-admin inbox updates).
alter table public.admin_notification replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_notification'
  ) then
    alter publication supabase_realtime add table public.admin_notification;
  end if;
end
$$;
