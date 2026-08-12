-- Platform settings: three scoped key-value stores.
--
--   settings_system  → platform-wide configuration (localization, schedules, etc.)
--   settings_admin   → admin-console behavior (module access, dashboard widgets, etc.)
--   settings_user    → mobile/user-app capabilities (self-service, privacy, etc.)
--
-- Design notes:
-- - Each store is a flat key -> jsonb map. One row per settings "group"
--   (keyed by the UI tab id, e.g. 'access-control'), value holds the group's config.
-- - jsonb keeps this open-ended: new fields can be added without migrations.
-- - Writes are superadmin-only (RLS). Reads are scoped so the rest of the system
--   can consume values safely.
-- - updated_at / updated_by are stamped automatically by trigger.

begin;

set search_path = public;

-- -- Shared audit-stamp trigger ------------------------------------------------
create or replace function public.tg_settings_stamp_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- -- Table factory is not available in plain SQL; define each explicitly. -------

create table if not exists public.settings_system (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create table if not exists public.settings_admin (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create table if not exists public.settings_user (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

comment on table public.settings_system is 'Platform-wide configuration (superadmin-managed). key = settings group id, value = jsonb config.';
comment on table public.settings_admin  is 'Admin-console configuration (superadmin-managed). key = settings group id, value = jsonb config.';
comment on table public.settings_user   is 'User/mobile-app capability configuration (superadmin-managed). key = settings group id, value = jsonb config.';

-- -- Stamp triggers ------------------------------------------------------------
drop trigger if exists settings_system_stamp on public.settings_system;
create trigger settings_system_stamp
  before insert or update on public.settings_system
  for each row execute function public.tg_settings_stamp_row();

drop trigger if exists settings_admin_stamp on public.settings_admin;
create trigger settings_admin_stamp
  before insert or update on public.settings_admin
  for each row execute function public.tg_settings_stamp_row();

drop trigger if exists settings_user_stamp on public.settings_user;
create trigger settings_user_stamp
  before insert or update on public.settings_user
  for each row execute function public.tg_settings_stamp_row();

-- -- Row Level Security --------------------------------------------------------
alter table public.settings_system enable row level security;
alter table public.settings_admin  enable row level security;
alter table public.settings_user   enable row level security;

-- SYSTEM: readable by any authenticated principal; superadmin writes.
drop policy if exists settings_system_read on public.settings_system;
create policy settings_system_read on public.settings_system
  for select to authenticated
  using (true);

drop policy if exists settings_system_write on public.settings_system;
create policy settings_system_write on public.settings_system
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

-- ADMIN: readable by any admin (line or super); superadmin writes.
drop policy if exists settings_admin_read on public.settings_admin;
create policy settings_admin_read on public.settings_admin
  for select to authenticated
  using (public.is_any_admin());

drop policy if exists settings_admin_write on public.settings_admin;
create policy settings_admin_write on public.settings_admin
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

-- USER: readable by any authenticated principal (user app reads capabilities); superadmin writes.
drop policy if exists settings_user_read on public.settings_user;
create policy settings_user_read on public.settings_user
  for select to authenticated
  using (true);

drop policy if exists settings_user_write on public.settings_user;
create policy settings_user_write on public.settings_user
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

-- -- Grants (RLS still governs row visibility) ---------------------------------
grant select, insert, update, delete on public.settings_system to authenticated;
grant select, insert, update, delete on public.settings_admin  to authenticated;
grant select, insert, update, delete on public.settings_user   to authenticated;

-- -- Seed default groups (idempotent) -----------------------------------------
-- Keys mirror the settings UI tab ids so the frontend can map 1:1.

insert into public.settings_system (key, value, description) values
  ('general',              '{"platform_name":"Apoyo","maintenance_mode":false,"support_hours":"Mon-Fri 8:00-17:00"}'::jsonb, 'General platform identity and availability.'),
  ('localization',         '{"default_language":"en","supported_languages":["en","fil"],"timezone":"Asia/Manila","date_format":"MMM D, YYYY"}'::jsonb, 'Language, timezone, and formatting defaults.'),
  ('voter-verification',   '{"require_voter_verification":true,"allow_manual_override":false}'::jsonb, 'Voter verification enforcement.'),
  ('application-defaults', '{"default_status":"pending","auto_assign_line_admin":true}'::jsonb, 'Defaults applied to new applications.'),
  ('application-schedule', '{"accepting_applications":true,"open_time":"08:00","close_time":"17:00","open_days":["mon","tue","wed","thu","fri"]}'::jsonb, 'When the platform accepts applications.'),
  ('notifications',        '{"email_enabled":true,"sms_enabled":false,"in_app_enabled":true}'::jsonb, 'Platform notification channel switches.'),
  ('system-control',       '{"registration_open":true,"read_only_mode":false}'::jsonb, 'Global system state controls.'),
  ('contact-information',  '{"support_email":"","support_phone":"","office_address":""}'::jsonb, 'Public support contact details.'),
  ('report-defaults',      '{"default_range":"month","default_format":"xlsx","mask_sensitive":true}'::jsonb, 'Defaults for report generation.'),
  ('location-rules',       '{"restrict_by_barangay":false,"allowed_barangays":[]}'::jsonb, 'Location-based eligibility rules.')
on conflict (key) do nothing;

insert into public.settings_admin (key, value, description) values
  ('access-control',       '{"scope_mode":"all","module_access":{"application":true,"scheduling":true,"case_study":true,"reports":true,"activity_logs":true},"admin_exceptions":[]}'::jsonb, 'Admin module access control.'),
  ('dashboard',            '{"show_total_applications":true,"show_status_breakdown":true,"show_distribution":true}'::jsonb, 'Admin dashboard widget visibility.'),
  ('application-module',   '{"overview":{"enabled":true,"scope_mode":"all"},"action_required":{"enabled":true,"scope_mode":"all"},"resubmission":{"enabled":true,"scope_mode":"all"}}'::jsonb, 'Application module tab availability.'),
  ('scheduling',           '{"enabled":true}'::jsonb, 'Scheduling module defaults.'),
  ('case-study',           '{"enabled":true}'::jsonb, 'Case study module defaults.'),
  ('approved-module',      '{"require_approval_notes":true,"auto_approval_reference":true,"show_approved_date":true,"allow_editing_after_approval":false,"allow_cancellation_reversal":false,"show_release_status":true,"notify_applicant_approved":true,"export_approved_list":true}'::jsonb, 'Approved module workflow flags.'),
  ('notification',         '{"enabled":true}'::jsonb, 'Admin notification defaults.'),
  ('reports',              '{"allow_viewing":true,"allow_export":true,"allow_printing":true,"allowed_formats":{"pdf":true,"excel":true,"csv":false},"show_charts":true,"mask_sensitive":true,"scheduled_reports":false,"schedule_frequency":"daily"}'::jsonb, 'Reports access and defaults.'),
  ('activity-logs',        '{"retention_days":365,"allow_export":true}'::jsonb, 'Activity log retention and export.'),
  ('account-security',     '{"session_timeout_minutes":180,"require_password_rotation":false,"password_rotation_days":90}'::jsonb, 'Admin account security policy.')
on conflict (key) do nothing;

insert into public.settings_user (key, value, description) values
  ('account-security',        '{"allow_change_password":true,"allow_view_recent_logins":true,"allow_logout_all":true,"editable_profile_fields":{"photo":true,"contact":true,"email":true,"address":true},"locked_identity_fields":{"fullName":true,"birthdate":true,"voterId":true,"barangay":true}}'::jsonb, 'User account and security capabilities.'),
  ('notification-preferences','{"channels":{"email":true,"in_app":true,"sms":false}}'::jsonb, 'Default user notification channels.'),
  ('application-preferences', '{"default_language":"en","form_density":"comfortable"}'::jsonb, 'User application experience defaults.'),
  ('privacy-settings',        '{"allow_view_policy":true,"allow_consent_processing":true,"allow_contact_announcements":true,"allow_download_data":true}'::jsonb, 'User privacy and consent options.'),
  ('account-management',      '{"allow_deactivate":true,"allow_request_deletion":true,"allow_download_info":true}'::jsonb, 'User self-service account management.')
on conflict (key) do nothing;

commit;
