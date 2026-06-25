-- supabase/migrations/0013_connections_grants.sql
--
-- 연결(connections) RPC 보안 하드닝 + 1:1 강제 보강.
--   - 0010에서 재정의된 accept_connect_invite가 revoke/grant 블록 없이 끝나
--     (0009/0010의 다른 RPC와 달리) 권한이 명시되지 않았다 → anon 노출 위험.
--     create or replace는 기존 권한을 보존하므로 배포된 함수는 이미 안전할 수 있으나,
--     0009/0010의 패턴(매 함수마다 revoke+grant 명시)에 맞춰 모든 연결 RPC에 재확인한다.
--   - get_connect_invite를 6컬럼(0010) 시그니처로 표준화해 시그니처 드리프트를 제거한다.
--   - 초대 토큰 만료(expires_at) 추가 + send_to_connection 자기발송 가드.
--
-- 운영자 적용: `supabase db push` (이 파일을 직접 실행하지 않는다).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 모든 연결 RPC 권한 재확인 (anon/public 차단 + authenticated만 실행)
--    0009/0010과 동일한 시그니처로 명시한다.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function create_connect_invite(text) from public;
grant execute on function create_connect_invite(text) to authenticated;

revoke all on function accept_connect_invite(text) from public;
grant execute on function accept_connect_invite(text) to authenticated;

revoke all on function get_connect_invite(text) from public;
grant execute on function get_connect_invite(text) to authenticated;

revoke all on function get_my_connections() from public;
grant execute on function get_my_connections() to authenticated;

revoke all on function disconnect_connection() from public;
grant execute on function disconnect_connection() to authenticated;

revoke all on function send_to_connection(uuid, uuid, text) from public;
grant execute on function send_to_connection(uuid, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 초대 토큰 만료 — connection_invites.expires_at 추가
--    기존 행은 expires_at = NULL(무기한)로 남겨 데이터를 깨지 않는다.
--    이후 생성되는 초대는 create_connect_invite에서 기본 7일 만료를 채운다.
-- ─────────────────────────────────────────────────────────────────────────────
alter table connection_invites add column if not exists expires_at timestamptz;

-- 초대 생성 — 기본 7일 만료를 채운다(만료 NULL이면 무기한이던 기존 동작과 호환).
create or replace function create_connect_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(p_token) < 22 or p_token !~ '^[A-Za-z0-9_\-]+$' then raise exception 'TOKEN_INVALID'; end if;
  insert into connection_invites (token, inviter_id, expires_at)
  values (p_token, auth.uid(), now() + interval '7 days');
  return p_token;
end;
$$;
revoke all on function create_connect_invite(text) from public;
grant execute on function create_connect_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_connect_invite — 6컬럼 시그니처로 표준화(0010과 동일) + 만료 반영
--    만료된 초대는 INVITE_NOT_FOUND로 처리해 시그니처 드리프트와 만료를 한 번에 막는다.
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
  -- 만료되지 않은 초대만 유효(expires_at NULL은 무기한 — 기존 행 호환).
  select ci.inviter_id into v_inviter
  from connection_invites ci
  where ci.token = p_token
    and (ci.expires_at is null or ci.expires_at > now());
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
-- 4. accept_connect_invite — 만료 검사 추가(독점 1:1 강제 로직은 0010 유지)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_connect_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select inviter_id into v_inviter
  from connection_invites
  where token = p_token
    and (expires_at is null or expires_at > now());
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
revoke all on function accept_connect_invite(text) from public;
grant execute on function accept_connect_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. send_to_connection — 자기발송 가드 추가(연결 확인 전에 차단)
--    독점 1:1 + check(user_a < user_b)로 자기연결은 존재할 수 없지만,
--    방어적으로 자기 자신에게의 발송을 명시적으로 거부한다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function send_to_connection(p_letter_id uuid, p_recipient uuid, p_token text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_recipient = auth.uid() then raise exception 'CANNOT_SEND_SELF'; end if;
  if not exists (select 1 from letters where id = p_letter_id and owner_id = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from connections
    where user_a = least(auth.uid(), p_recipient)
      and user_b = greatest(auth.uid(), p_recipient)
  ) then
    raise exception 'NOT_CONNECTED';
  end if;
  if length(p_token) < 22 or p_token !~ '^[A-Za-z0-9_\-]+$' then raise exception 'TOKEN_INVALID'; end if;

  insert into delivery_links (letter_id, owner_id, token)
  values (p_letter_id, auth.uid(), p_token);

  insert into inbox (user_id, letter_id, token)
  values (p_recipient, p_letter_id, p_token)
  on conflict (user_id, letter_id) do update set token = excluded.token, saved_at = now();

  return p_token;
end;
$$;
revoke all on function send_to_connection(uuid, uuid, text) from public;
grant execute on function send_to_connection(uuid, uuid, text) to authenticated;
