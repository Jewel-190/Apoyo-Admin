-- Unify settings_system / settings_admin / settings_user into public.settings.
-- One row per (scope, key) group; value is jsonb for open-ended config payloads.

begin;

set search_path = public;

-- -- Stamp trigger (reuse / refresh) -------------------------------------------
create or replace function public.tg_settings_stamp_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    if new.created_at is null then
      new.created_at := now();
    end if;
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

-- -- Unified settings table ---------------------------------------------------
create table if not exists public.settings (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null
                check (scope in ('system', 'admin', 'user')),
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  description text,
  visibility  text not null default 'authenticated'
                check (visibility in ('public', 'authenticated', 'admin', 'superadmin')),
  is_secret   boolean not null default false,
  is_active   boolean not null default true,
  version     integer not null default 1,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  constraint settings_scope_key_unique unique (scope, key)
);

comment on table public.settings is
  'Unified platform settings store. scope = system|admin|user; key = settings group id; value = jsonb config blob.';
comment on column public.settings.scope is 'Logical settings surface: system, admin, or user.';
comment on column public.settings.key is 'Settings group id (mirrors UI tab id).';
comment on column public.settings.value is 'Arbitrary JSON configuration for the group.';
comment on column public.settings.visibility is 'Read ACL hint: public|authenticated|admin|superadmin.';
comment on column public.settings.is_secret is 'When true, readable only by superadmins.';
comment on column public.settings.version is 'Optimistic concurrency counter; bumped on each update.';
comment on column public.settings.metadata is 'Extensible non-value metadata (labels, UI hints, schema notes).';

create index if not exists settings_scope_idx on public.settings (scope);
create index if not exists settings_scope_active_idx on public.settings (scope, is_active);
create index if not exists settings_visibility_idx on public.settings (visibility);

drop trigger if exists settings_stamp on public.settings;
create trigger settings_stamp
  before insert or update on public.settings
  for each row execute function public.tg_settings_stamp_row();

-- -- Migrate existing rows (if legacy tables still present) -------------------
do $$
begin
  if to_regclass('public.settings_system') is not null then
    insert into public.settings (scope, key, value, description, visibility, updated_at, updated_by)
    select
      'system',
      s.key,
      coalesce(s.value, '{}'::jsonb),
      s.description,
      'authenticated',
      coalesce(s.updated_at, now()),
      s.updated_by
    from public.settings_system s
    on conflict (scope, key) do update
      set value = excluded.value,
          description = coalesce(excluded.description, public.settings.description),
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          version = public.settings.version + 1;
  end if;

  if to_regclass('public.settings_admin') is not null then
    insert into public.settings (scope, key, value, description, visibility, updated_at, updated_by)
    select
      'admin',
      s.key,
      coalesce(s.value, '{}'::jsonb),
      s.description,
      'admin',
      coalesce(s.updated_at, now()),
      s.updated_by
    from public.settings_admin s
    on conflict (scope, key) do update
      set value = excluded.value,
          description = coalesce(excluded.description, public.settings.description),
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          version = public.settings.version + 1;
  end if;

  if to_regclass('public.settings_user') is not null then
    insert into public.settings (scope, key, value, description, visibility, updated_at, updated_by)
    select
      'user',
      s.key,
      coalesce(s.value, '{}'::jsonb),
      s.description,
      'authenticated',
      coalesce(s.updated_at, now()),
      s.updated_by
    from public.settings_user s
    on conflict (scope, key) do update
      set value = excluded.value,
          description = coalesce(excluded.description, public.settings.description),
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          version = public.settings.version + 1;
  end if;
end;
$$;

-- -- Seed defaults for any missing groups (idempotent) -----------------------
insert into public.settings (scope, key, value, description, visibility) values
  ('system', 'general', '{"platform_name":"Apoyo","maintenance_mode":false,"support_hours":"Mon-Fri 8:00-17:00"}'::jsonb, 'General platform identity and availability.', 'authenticated'),
  ('system', 'localization', '{"default_language":"en","supported_languages":["en","fil"],"timezone":"Asia/Manila","date_format":"MMM D, YYYY"}'::jsonb, 'Language, timezone, and formatting defaults.', 'authenticated'),
  ('system', 'voter-verification', '{"require_voter_verification":true,"allow_manual_override":false}'::jsonb, 'Voter verification enforcement.', 'authenticated'),
  ('system', 'application-defaults', '{"default_status":"pending","auto_assign_line_admin":true}'::jsonb, 'Defaults applied to new applications.', 'authenticated'),
  ('system', 'application-schedule', '{"accepting_applications":true,"open_time":"08:00","close_time":"17:00","open_days":["mon","tue","wed","thu","fri"]}'::jsonb, 'When the platform accepts applications.', 'authenticated'),
  ('system', 'notifications', '{"email_enabled":true,"sms_enabled":false,"in_app_enabled":true}'::jsonb, 'Platform notification channel switches.', 'authenticated'),
  ('system', 'system-control', '{"registration_open":true,"read_only_mode":false}'::jsonb, 'Global system state controls.', 'authenticated'),
  ('system', 'contact-information', '{"support_email":"","support_phone":"","office_address":""}'::jsonb, 'Public support contact details.', 'authenticated'),
  ('system', 'report-defaults', '{"default_range":"month","default_format":"xlsx","mask_sensitive":true}'::jsonb, 'Defaults for report generation.', 'authenticated'),
  ('system', 'location-rules', '{"restrict_by_barangay":false,"allowed_barangays":[]}'::jsonb, 'Location-based eligibility rules.', 'authenticated'),
  ('admin', 'access-control', '{"scope_mode":"all","module_access":{"application":true,"scheduling":true,"case_study":true,"reports":true,"activity_logs":true},"admin_exceptions":[]}'::jsonb, 'Admin module access control.', 'admin'),
  ('admin', 'dashboard', '{"show_total_applications":true,"show_status_breakdown":true,"show_distribution":true}'::jsonb, 'Admin dashboard widget visibility.', 'admin'),
  ('admin', 'application-module', '{"overview":{"enabled":true,"scope_mode":"all"},"action_required":{"enabled":true,"scope_mode":"all"},"resubmission":{"enabled":true,"scope_mode":"all"}}'::jsonb, 'Application module tab availability.', 'admin'),
  ('admin', 'scheduling', '{"enabled":true}'::jsonb, 'Scheduling module defaults.', 'admin'),
  ('admin', 'case-study', '{"enabled":true}'::jsonb, 'Case study module defaults.', 'admin'),
  ('admin', 'approved-module', '{"require_approval_notes":true,"auto_approval_reference":true,"show_approved_date":true,"allow_editing_after_approval":false,"allow_cancellation_reversal":false,"show_release_status":true,"notify_applicant_approved":true,"export_approved_list":true}'::jsonb, 'Approved module workflow flags.', 'admin'),
  ('admin', 'notification', '{"enabled":true}'::jsonb, 'Admin notification defaults.', 'admin'),
  ('admin', 'reports', '{"allow_viewing":true,"allow_export":true,"allow_printing":true,"allowed_formats":{"pdf":true,"excel":true,"csv":false},"show_charts":true,"mask_sensitive":true,"scheduled_reports":false,"schedule_frequency":"daily"}'::jsonb, 'Reports access and defaults.', 'admin'),
  ('admin', 'activity-logs', '{"retention_days":365,"allow_export":true}'::jsonb, 'Activity log retention and export.', 'admin'),
  ('admin', 'account-security', '{"session_timeout_minutes":180,"require_password_rotation":false,"password_rotation_days":90}'::jsonb, 'Admin account security policy.', 'admin'),
  ('user', 'account-security', '{"allow_change_password":true,"allow_view_recent_logins":true,"allow_logout_all":true,"editable_profile_fields":{"photo":true,"contact":true,"email":true,"address":true},"locked_identity_fields":{"fullName":true,"birthdate":true,"voterId":true,"barangay":true}}'::jsonb, 'User account and security capabilities.', 'authenticated'),
  ('user', 'notification-preferences', '{"channels":{"email":true,"in_app":true,"sms":false}}'::jsonb, 'Default user notification channels.', 'authenticated'),
  ('user', 'application-preferences', '{"default_language":"en","form_density":"comfortable"}'::jsonb, 'User application experience defaults.', 'authenticated'),
  ('user', 'privacy-settings', '{"allow_view_policy":true,"allow_consent_processing":true,"allow_contact_announcements":true,"allow_download_data":true}'::jsonb, 'User privacy and consent options.', 'authenticated'),
  ('user', 'account-management', '{"allow_deactivate":true,"allow_request_deletion":true,"allow_download_info":true}'::jsonb, 'User self-service account management.', 'authenticated')
on conflict (scope, key) do nothing;

-- -- Row Level Security -------------------------------------------------------
alter table public.settings enable row level security;

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated
  using (
    is_active = true
    and (
      public.is_superadmin(auth.uid())
      or (
        is_secret = false
        and (
          visibility = 'public'
          or visibility = 'authenticated'
          or (visibility = 'admin' and public.is_any_admin())
          or (visibility = 'superadmin' and public.is_superadmin(auth.uid()))
        )
      )
    )
  );

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.settings to service_role;

-- -- Drop legacy tables -------------------------------------------------------
drop table if exists public.settings_system cascade;
drop table if exists public.settings_admin cascade;
drop table if exists public.settings_user cascade;

commit;
