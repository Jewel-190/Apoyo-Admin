-- Applicants may change only current contact fields on their own users row.
-- Identity (name, VIN, barangay, email, sex, birth date) stays locked here;
-- superadmin User Management still writes those via service_role.
-- Avatar upload on Account already updates avatar_url and must keep working.
-- Assistance requests keep joining public.users, so new contact is what
-- Requester Info and admin profile views show. Request rows are not rewritten.

begin;

set search_path = public;

revoke update on table public.users from authenticated;
grant update (contact_number, address, avatar_url) on table public.users to authenticated;

comment on table public.users is
  'Applicant profiles. RLS: owner read/write own row; line admins read caseload; superadmins read all. Applicant self-update is limited to contact_number, address, and avatar_url. Deletes and privileged updates use service role.';

commit;

-- rollback
-- begin;
-- grant update on table public.users to authenticated;
-- commit;
