-- Logo & Banner branding settings (public-readable for login header).
-- Uploaded files live in the existing public `web-content` storage bucket.

begin;

insert into public.settings (scope, key, value, description, visibility)
values (
  'system',
  'logo-and-banner',
  '{
    "apoyo_logo_url": "",
    "apoyo_banner_url": "",
    "dasma_logo_url": "",
    "dasma_banner_url": ""
  }'::jsonb,
  'Platform logo and banner assets for admin, superadmin, and login chrome.',
  'public'
)
on conflict (scope, key) do update
  set description = excluded.description,
      visibility = excluded.visibility,
      updated_at = now();

-- Allow anonymous clients (login page) to read non-secret public settings.
drop policy if exists settings_select_anon on public.settings;
create policy settings_select_anon on public.settings
  for select to anon
  using (
    is_active = true
    and is_secret = false
    and visibility = 'public'
  );

grant select on public.settings to anon;

commit;
