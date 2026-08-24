-- Drop unused public.users.verified and enable least-privilege RLS.
-- Applicant PII: own row for the signed-in user; line admins see applicants
-- with a non-draft request in their assistance; superadmins see all.
-- Superadmin profile writes continue through service-role edge functions.

begin;

set search_path = public;

alter table public.users
  drop column if exists verified;

create or replace function public.admin_can_access_user_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assistance_requests r
    join public.assistance_services s on s.id = r.service_id
    where r.user_id = p_user_id
      and nullif(trim(lower(r.status::text)), '') is distinct from 'draft'
      and coalesce(s.active, true) = true
      and public.line_admin_matches_category(auth.uid(), s.category_id)
  );
$$;

comment on function public.admin_can_access_user_profile(uuid) is
  'True when the caller is a line admin whose assistance has a non-draft request from this applicant.';

revoke all on function public.admin_can_access_user_profile(uuid) from public, anon;
grant execute on function public.admin_can_access_user_profile(uuid) to authenticated, service_role;

revoke all on table public.users from anon;
revoke all on table public.users from authenticated;
grant select, insert, update on table public.users to authenticated;
grant all on table public.users to service_role;

alter table public.users enable row level security;

drop policy if exists "Allow insert for new users" on public.users;
drop policy if exists "sign in" on public.users;
drop policy if exists users_select on public.users;
drop policy if exists users_insert_own on public.users;
drop policy if exists users_update_own on public.users;

create policy users_select on public.users
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_superadmin(auth.uid())
    or public.admin_can_access_user_profile(id)
  );

create policy users_insert_own on public.users
  for insert
  to authenticated
  with check (id = auth.uid());

create policy users_update_own on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

comment on table public.users is
  'Applicant profiles. RLS: owner read/write own row; line admins read caseload; superadmins read all. Deletes and privileged updates use service role.';

commit;
