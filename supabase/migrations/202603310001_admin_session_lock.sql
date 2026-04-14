-- Session lock for single active admin session per account across devices.

create table if not exists public.admin_active_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  session_id text not null,
  last_seen timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists admin_active_sessions_email_key
  on public.admin_active_sessions (email);

alter table public.admin_active_sessions enable row level security;

-- Policies for direct table access by the signed-in owner only.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_active_sessions'
      and policyname = 'admin_active_sessions_select_own'
  ) then
    create policy admin_active_sessions_select_own
      on public.admin_active_sessions
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_active_sessions'
      and policyname = 'admin_active_sessions_insert_own'
  ) then
    create policy admin_active_sessions_insert_own
      on public.admin_active_sessions
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_active_sessions'
      and policyname = 'admin_active_sessions_update_own'
  ) then
    create policy admin_active_sessions_update_own
      on public.admin_active_sessions
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_active_sessions'
      and policyname = 'admin_active_sessions_delete_own'
  ) then
    create policy admin_active_sessions_delete_own
      on public.admin_active_sessions
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

create or replace function public.prune_admin_active_sessions(
  p_ttl_seconds integer default 180
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.admin_active_sessions
  where last_seen <= timezone('utc', now()) - make_interval(secs => greatest(p_ttl_seconds, 1));
end;
$$;

create or replace function public.claim_admin_session(
  p_user_id uuid,
  p_email text,
  p_session_id text,
  p_ttl_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_owner_session_id text;
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or coalesce(trim(p_email), '') = '' or coalesce(trim(p_session_id), '') = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  insert into public.admin_active_sessions (user_id, email, session_id, last_seen, created_at)
  values (p_user_id, lower(trim(p_email)), trim(p_session_id), v_now, v_now)
  on conflict (user_id)
  do update
    set email = excluded.email,
        session_id = excluded.session_id,
        last_seen = v_now
    where public.admin_active_sessions.session_id = excluded.session_id
      or public.admin_active_sessions.last_seen <= v_now - make_interval(secs => greatest(p_ttl_seconds, 1));

  select session_id
  into v_owner_session_id
  from public.admin_active_sessions
  where user_id = p_user_id;

  return v_owner_session_id = trim(p_session_id);
end;
$$;

create or replace function public.touch_admin_session(
  p_user_id uuid,
  p_session_id text,
  p_ttl_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  update public.admin_active_sessions
  set last_seen = timezone('utc', now())
  where user_id = p_user_id
    and session_id = trim(p_session_id);

  return found;
end;
$$;

create or replace function public.release_admin_session(
  p_user_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  delete from public.admin_active_sessions
  where user_id = p_user_id
    and session_id = trim(p_session_id);

  return found;
end;
$$;

create or replace function public.is_admin_session_locked(
  p_email text,
  p_candidate_session_id text default null,
  p_ttl_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_session_id text;
begin
  if v_email = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  select session_id
  into v_session_id
  from public.admin_active_sessions
  where email = v_email;

  if not found then
    return false;
  end if;

  if p_candidate_session_id is not null and trim(p_candidate_session_id) = v_session_id then
    return false;
  end if;

  return true;
end;
$$;

-- Optional helper for debugging lock ownership from authenticated clients.
create or replace function public.get_admin_session_by_user_id(
  p_user_id uuid
)
returns table (
  user_id uuid,
  email text,
  session_id text,
  last_seen timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select s.user_id, s.email, s.session_id, s.last_seen, s.created_at
  from public.admin_active_sessions s
  where s.user_id = p_user_id
    and auth.uid() = p_user_id;
$$;

revoke all on function public.prune_admin_active_sessions(integer) from public;
revoke all on function public.claim_admin_session(uuid, text, text, integer) from public;
revoke all on function public.touch_admin_session(uuid, text, integer) from public;
revoke all on function public.release_admin_session(uuid, text) from public;
revoke all on function public.is_admin_session_locked(text, text, integer) from public;
revoke all on function public.get_admin_session_by_user_id(uuid) from public;

grant execute on function public.claim_admin_session(uuid, text, text, integer) to authenticated;
grant execute on function public.touch_admin_session(uuid, text, integer) to authenticated;
grant execute on function public.release_admin_session(uuid, text) to authenticated;
grant execute on function public.get_admin_session_by_user_id(uuid) to authenticated;
grant execute on function public.is_admin_session_locked(text, text, integer) to anon, authenticated;
