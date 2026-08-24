-- Remove leftover catalog SELECT policies that still JOIN other RLS tables.
-- Public/active reads and history helpers from 202608241530 already cover these
-- cases; the joins are a recursion footgun if a new policy is added later.

begin;

set search_path = public;

create or replace function public.rls_can_select_requirement_tip(p_requirement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requirements r
    where r.id = p_requirement_id
      and public.rls_can_select_assistance_requirement(r.service_id)
  );
$$;

revoke all on function public.rls_can_select_requirement_tip(uuid) from public, anon;
grant execute on function public.rls_can_select_requirement_tip(uuid) to authenticated, service_role;

drop policy if exists assistance_services_select on public.assistance_services;
drop policy if exists assistance_requirements_select on public.assistance_requirements;
drop policy if exists assistance_requirement_tips_select on public.assistance_requirement_tips;

create policy assistance_requirement_tips_select_history
  on public.assistance_requirement_tips
  for select
  to authenticated
  using (public.rls_can_select_requirement_tip(requirement_id));

commit;
