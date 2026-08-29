-- Password login should take over the single-session lock.
-- Blocking "already signed in elsewhere" prevented Super Admin from using
-- the public tunnel while a local :5173 tab still held the heartbeat.

CREATE OR REPLACE FUNCTION public.claim_admin_session(
  p_user_id uuid,
  p_email text,
  p_session_id text,
  p_ttl_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
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
        updated_at = v_now;

  select session_id
  into v_owner_session_id
  from public.admin_active_sessions
  where user_id = p_user_id;

  return v_owner_session_id = v_session_id;
end;
$$;
