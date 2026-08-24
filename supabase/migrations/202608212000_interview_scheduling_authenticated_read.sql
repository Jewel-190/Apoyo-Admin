-- Applicants must read the interview briefing on mobile (For Approval → Scheduled).
-- Superadmin remains the only writer via super-admin-settings-management.

begin;

set search_path = public;

update public.settings
set
  visibility = 'authenticated',
  description = 'Interview scheduling briefing shown in Admin For Approval → Scheduling and on the applicant app.'
where scope = 'admin'
  and key = 'interview-scheduling';

commit;
