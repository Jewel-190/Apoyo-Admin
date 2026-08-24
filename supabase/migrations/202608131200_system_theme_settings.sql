-- System Theme: single primary color for Superadmin + Login (public-readable).

begin;

insert into public.settings (scope, key, value, description, visibility)
values (
  'system',
  'system-theme',
  '{"primary_color":"#0b8f8b"}'::jsonb,
  'System primary color for Superadmin and Login chrome.',
  'public'
)
on conflict (scope, key) do update
  set description = excluded.description,
      visibility = 'public',
      updated_at = now();

commit;
