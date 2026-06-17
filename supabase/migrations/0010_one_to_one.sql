-- supabase/migrations/0010_one_to_one.sql
--
-- 독점 1:1 연결: 각 사용자는 동시에 한 명과만 연결.
--   - accept_connect_invite: 양쪽 모두 기존 연결이 없을 때만 수락.
--   - disconnect_connection: 연결 해제. **편지/받은함(letters·inbox·delivery_links)은 그대로 둔다**
--     → 연결이 끊겨도 보냈던/받았던 편지는 각자에게 남고, /people 스레드(주고받은 기록)도 유지된다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. accept_connect_invite — 독점 1:1 강제
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_connect_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select inviter_id into v_inviter from connection_invites where token = p_token;
  if v_inviter is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inviter = auth.uid() then raise exception 'CANNOT_CONNECT_SELF'; end if;

  -- 독점 1:1: 나 또는 상대가 이미 다른 사람과 연결돼 있으면 거부.
  if exists (select 1 from connections where user_a = auth.uid() or user_b = auth.uid()) then
    raise exception 'ALREADY_CONNECTED_SELF';
  end if;
  if exists (select 1 from connections where user_a = v_inviter or user_b = v_inviter) then
    raise exception 'ALREADY_CONNECTED_OTHER';
  end if;

  insert into connections (user_a, user_b)
  values (least(v_inviter, auth.uid()), greatest(v_inviter, auth.uid()))
  on conflict (user_a, user_b) do nothing;

  update connection_invites set accepted_by = auth.uid(), accepted_at = now() where token = p_token;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_connect_invite — 1:1 상태(나/상대가 이미 연결됐는지) 포함하도록 확장
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists get_connect_invite(text);
create or replace function get_connect_invite(p_token text)
returns table (
  inviter_id            uuid,
  inviter_nickname      text,
  is_self               boolean,
  already_connected     boolean,
  viewer_has_connection boolean,
  inviter_has_connection boolean
)
language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select ci.inviter_id into v_inviter from connection_invites ci where ci.token = p_token;
  if v_inviter is null then raise exception 'INVITE_NOT_FOUND'; end if;
  return query
    select v_inviter,
           (select nickname from profiles where id = v_inviter),
           v_inviter = auth.uid(),
           exists (select 1 from connections c
                   where c.user_a = least(v_inviter, auth.uid())
                     and c.user_b = greatest(v_inviter, auth.uid())),
           exists (select 1 from connections c where c.user_a = auth.uid() or c.user_b = auth.uid()),
           exists (select 1 from connections c where c.user_a = v_inviter or c.user_b = v_inviter);
end;
$$;
revoke all on function get_connect_invite(text) from public;
grant execute on function get_connect_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. disconnect_connection — 연결 해제(편지·받은함은 보존)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function disconnect_connection()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  -- 독점 1:1이므로 내가 속한 연결은 최대 하나. 그 행만 삭제한다.
  -- letters / inbox / delivery_links 는 손대지 않는다 → 주고받은 편지는 각자에게 남는다.
  delete from connections where user_a = auth.uid() or user_b = auth.uid();
end;
$$;
revoke all on function disconnect_connection() from public;
grant execute on function disconnect_connection() to authenticated;
