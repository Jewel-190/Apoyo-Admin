-- Additional attachment (slot_key = attachment) must not have requirement tips.

begin;

set search_path = public;

delete from public.assistance_requirement_tips t
using public.assistance_requirements r
where t.requirement_id = r.id
  and r.slot_key = 'attachment';

-- Clear sample-doc metadata on attachment rows (tips/samples are N/A).
update public.assistance_requirements
set metadata = '{}'::jsonb,
    updated_at = now()
where slot_key = 'attachment'
  and metadata is distinct from '{}'::jsonb;

commit;
