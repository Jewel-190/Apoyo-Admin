-- Superadmin-only directory of admins (joins auth.users for email).
-- Client cannot read other admins directly (admins RLS = own row only),
-- so expose a gated SECURITY DEFINER function for the Admin assignment screen.

begin;

create or replace function public.superadmin_list_admins()
returns table (
  user_id uuid,
  email text,
  is_super_admin boolean,
  category_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    a.user_id,
    u.email::text as email,
    a.is_super_admin,
    a.category_id,
    a.created_at
  from public.admins a
  left join auth.users u on u.id = a.user_id
  where public.is_superadmin(auth.uid())
  order by a.is_super_admin desc, a.created_at asc;
$$;

comment on function public.superadmin_list_admins() is
  'Superadmin-only admin directory: returns each admin row with auth email. Empty set for non-superadmins.';

revoke all on function public.superadmin_list_admins() from public, anon;
grant execute on function public.superadmin_list_admins() to authenticated;

commit;
