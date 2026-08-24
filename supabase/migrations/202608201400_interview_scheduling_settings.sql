-- Interview scheduling briefing for Admin For Approval → Scheduling.
-- Superadmin edits copy/time; the Application Number step is always injected in code.

begin;

set search_path = public;

insert into public.settings (scope, key, value, description, visibility)
values (
  'admin',
  'interview-scheduling',
  '{
    "title": "Instructions",
    "subtitle": "Applicant briefing",
    "officeHours": {
      "days": "Monday - Friday",
      "start": "08:00",
      "end": "17:00"
    },
    "steps": [
      {
        "id": "step-visit",
        "kind": "text",
        "body": "Visit the Socio-Economic and Multi-Purpose Building Barangay Burol Main, City of Dasmariñas, Cavite"
      },
      {
        "id": "application-number",
        "kind": "application_number",
        "body": "Present your Application Number:"
      },
      {
        "id": "step-valid-id",
        "kind": "text",
        "body": "Bring one (1) Original Valid ID for verification."
      }
    ]
  }'::jsonb,
  'Interview scheduling briefing shown in Admin For Approval → Scheduling.',
  'admin'
)
on conflict (scope, key) do nothing;

commit;
