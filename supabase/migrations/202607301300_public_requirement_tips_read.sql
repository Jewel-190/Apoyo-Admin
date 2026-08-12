-- Allow public read of requirement tips for active services (Services marketing page).

begin;

set search_path = public;

alter table if exists public.assistance_requirement_tips enable row level security;

drop policy if exists assistance_requirement_tips_public_read_for_active_services
  on public.assistance_requirement_tips;

create policy assistance_requirement_tips_public_read_for_active_services
  on public.assistance_requirement_tips
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.assistance_requirements r
      join public.assistance_services s on s.id = r.service_id
      where r.id = assistance_requirement_tips.requirement_id
        and s.active is true
    )
  );

grant select on public.assistance_requirement_tips to anon, authenticated;

commit;
