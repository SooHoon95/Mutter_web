-- supabase/migrations/0027_connections_n_to_n.sql
--
-- 연결 기능: 독점 1:1 → N:N(다대다) 전환.
--
-- 기존: 한 사람은 동시에 한 명하고만 연결. accept_connect_invite가 "이미 연결됨"을
--   ALREADY_CONNECTED_SELF/OTHER로 차단해 배타성을 강제했다.
-- 전환: 한 사람이 여러 명과 연결 가능. 배타성 가드를 제거하고, 같은 상대와의 "중복 연결"만 막는다.
--
-- 이미 N:N을 지원하던 것(불변): connections 페어 테이블(unique(user_a,user_b)는 중복 페어만 방지,
--   유저당 연결 수 제한 없음), send_to_connection(p_recipient로 수신자 지정), get_my_connections(리스트).
--
-- 함께 바뀌는 클라이언트: disconnect가 대상(p_other_user)을 받도록 시그니처 변경 → 앱/웹 호출부 갱신.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. accept_connect_invite — 배타성 제거(중복 페어만 방지)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_connect_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inviter uuid;
  v_invite  connection_invites;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  -- 만료되지 않은 초대만 유효(expires_at NULL은 무기한 — 기존 행 호환).
  select * into v_invite
  from connection_invites
  where token = p_token
    and (expires_at is null or expires_at > now());
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_invite.accepted_by is not null then raise exception 'INVITE_ALREADY_USED'; end if;

  v_inviter := v_invite.inviter_id;
  if v_inviter = auth.uid() then raise exception 'CANNOT_CONNECT_SELF'; end if;

  -- 이 페어에 대해 직렬화(동시 수락 레이스로 중복 삽입 방지). 낮은/높은 uid 순서로 advisory lock.
  perform pg_advisory_xact_lock(hashtext(least(v_inviter, auth.uid())::text));
  perform pg_advisory_xact_lock(hashtext(greatest(v_inviter, auth.uid())::text));

  -- N:N: 배타성(내가/상대가 이미 누군가와 연결) 제거. 같은 상대와의 중복 연결만 막는다.
  if exists (
    select 1 from connections
    where user_a = least(v_inviter, auth.uid())
      and user_b = greatest(v_inviter, auth.uid())
  ) then
    raise exception 'ALREADY_CONNECTED';
  end if;

  insert into connections (user_a, user_b)
  values (least(v_inviter, auth.uid()), greatest(v_inviter, auth.uid()));

  update connection_invites set accepted_by = auth.uid(), accepted_at = now() where token = p_token;
end;
$$;
revoke all on function accept_connect_invite(text) from public;
grant execute on function accept_connect_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. disconnect_connection(p_other_user) — 특정 연결만 해제
--    (구 무인자 disconnect_connection()은 "유일한 연결 삭제"라 N:N에서 무의미 → DROP)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists disconnect_connection();

create or replace function disconnect_connection(p_other_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from connections
  where user_a = least(auth.uid(), p_other_user)
    and user_b = greatest(auth.uid(), p_other_user);
end;
$$;
revoke all on function disconnect_connection(uuid) from public;
grant execute on function disconnect_connection(uuid) to authenticated;
