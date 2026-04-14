-- Harden admin session locks and align local migration history with the live schema.

alter table if exists public.admin_active_sessions
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists admin_active_sessions_last_seen_idx
  on public.admin_active_sessions (last_seen);

create or replace function public.set_admin_active_sessions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_admin_active_sessions_updated_at
  on public.admin_active_sessions;

create trigger trg_admin_active_sessions_updated_at
before update on public.admin_active_sessions
for each row
execute function public.set_admin_active_sessions_updated_at();

create or replace function public.prune_admin_active_sessions(
  p_ttl_seconds integer default 180
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 180), 1);
begin
  delete from public.admin_active_sessions
  where last_seen <= timezone('utc', now()) - make_interval(secs => v_ttl);
end;
$$;

create or replace function public.cleanup_stale_admin_active_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.admin_active_sessions
  where last_seen <= timezone('utc', now()) - make_interval(secs => 180);

  get diagnostics v_deleted = row_count;
  return v_deleted;
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
  v_email text := lower(trim(coalesce(p_email, '')));
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or v_email = '' or v_session_id = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  insert into public.admin_active_sessions (
    user_id,
    email,
    session_id,
    last_seen,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    v_email,
    v_session_id,
    v_now,
    v_now,
    v_now
  )
  on conflict (user_id)
  do update
    set email = excluded.email,
        session_id = excluded.session_id,
        last_seen = v_now,
        updated_at = v_now
    where public.admin_active_sessions.session_id = excluded.session_id
      or public.admin_active_sessions.last_seen <= v_now - make_interval(secs => greatest(coalesce(p_ttl_seconds, 180), 1));

  select session_id
  into v_owner_session_id
  from public.admin_active_sessions
  where user_id = p_user_id;

  return v_owner_session_id = v_session_id;
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
declare
  v_now timestamptz := timezone('utc', now());
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or v_session_id = '' then
    return false;
  end if;

  perform public.prune_admin_active_sessions(p_ttl_seconds);

  update public.admin_active_sessions
  set last_seen = v_now,
      updated_at = v_now
  where user_id = p_user_id
    and session_id = v_session_id;

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
declare
  v_session_id text := trim(coalesce(p_session_id, ''));
begin
  if auth.uid() is distinct from p_user_id then
    return false;
  end if;

  if p_user_id is null or v_session_id = '' then
    return false;
  end if;

  delete from public.admin_active_sessions
  where user_id = p_user_id
    and session_id = v_session_id;

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
  v_candidate_session_id text := nullif(trim(coalesce(p_candidate_session_id, '')), '');
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

  if v_candidate_session_id is not null and v_candidate_session_id = v_session_id then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.set_admin_active_sessions_updated_at() from public;
revoke all on function public.cleanup_stale_admin_active_sessions() from public;

grant execute on function public.cleanup_stale_admin_active_sessions() to authenticated;
