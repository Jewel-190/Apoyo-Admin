-- Move "Monetary Burial Aid" from Burial → Financial catalog line.

begin;

set search_path = public;

update public.assistance_services
set
  category_id = (
    select id from public.assistance_categories where slug = 'financial' limit 1
  ),
  display_name = 'Monetary Financial Assistance',
  reminder_text =
    'Requests must be filed by the concerned individual or an immediate family member residing in the same household, and supporting documents must be complete upon submission.',
  who_bullets = '["Individuals and families with inadequate resources."]'::jsonb,
  attachment_slot_map = jsonb_build_object(
    'letter', 'letter_file',
    'voterId', 'voter_id_file',
    'barangay', 'barangay_endorsement_file',
    'indigency', 'indigency_cert_file',
    'validId', 'valid_id_file',
    'attachment', 'attachment_file'
  ),
  radio_selection = (
    select radio_selection
    from public.assistance_services
    where id = '8415e418-a478-4841-8c96-0da78ef892ea'
  ),
  request_code_token = 'monetaryfinancialreq',
  sort_order = 2,
  updated_at = now()
where id = '761b98a2-35c0-4a08-91b6-eb0a13cfa43d';

update public.assistance_requirements
set slot_key = 'validId', title = 'Valid ID'
where service_id = '761b98a2-35c0-4a08-91b6-eb0a13cfa43d'
  and slot_key = 'birthCert';

update public.assistance_requirements
set title = 'Personal Letter'
where service_id = '761b98a2-35c0-4a08-91b6-eb0a13cfa43d'
  and slot_key = 'letter';

update public.assistance_requirements
set title = 'Applicant''s Voters ID / Certificate'
where service_id = '761b98a2-35c0-4a08-91b6-eb0a13cfa43d'
  and slot_key = 'voterId';

update public.assistance_requirements
set title = 'Endorsement & Indigency Certificate'
where service_id = '761b98a2-35c0-4a08-91b6-eb0a13cfa43d'
  and slot_key in ('barangay', 'indigency');

commit;
