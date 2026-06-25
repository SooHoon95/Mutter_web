-- supabase/migrations/0020_audit_round2.sql
--
-- 전수 점검 2차(파일 출력 방식으로 재실행)에서 확정된 결함 수정.
--
-- P1-A) 받은함/스레드에 무효(revoke)·만료(expiry) 편지가 "열기" 링크로 남음:
--   sender가 링크를 revoke해도 recipient의 inbox 행은 남고(FK 캐스케이드 없음),
--   get_my_inbox / get_thread(received)가 delivery_links 상태를 안 봐서 죽은 링크를 노출 →
--   열면 get_letter_by_token이 LINK_REVOKED/EXPIRED로 막다른 에러. 살아있는 링크만 노출한다.
--
-- P1-B) 독점 1:1 동시 수락 레이스: accept_connect_invite의 배타성 검사가 EXISTS 2개 + INSERT뿐이라
--   같은 유저가 두 초대를 동시에 수락하면 둘 다 "연결 없음"을 읽고 둘 다 INSERT → 한 명이 2개 연결.
--   당사자 두 유저에 advisory xact lock을 걸어 동시 수락을 직렬화한다(least/greatest로 데드락 방지).

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-A-1. get_my_inbox — 살아있는 링크(미revoke·미만료)만 노출
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_my_inbox()
returns table (
  letter_id       uuid,
  token           text,
  title           text,
  saved_at        timestamptz,
  sender_id       uuid,
  sender_nickname text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select i.letter_id, i.token, l.title, i.saved_at, l.owner_id, p.nickname
    from inbox i
    join letters l on l.id = i.letter_id
    -- 죽은 링크(revoke/만료)는 열면 에러이므로 받은함에서 제외한다.
    join delivery_links dl on dl.token = i.token
      and dl.revoked = false
      and (dl.expires_at is null or dl.expires_at > now())
    left join profiles p on p.id = l.owner_id
    where i.user_id = auth.uid()
    order by i.saved_at desc;
end;
$$;
revoke all on function get_my_inbox() from public;
grant execute on function get_my_inbox() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-A-2. get_thread — received 분기도 살아있는 링크만(보냄 분기는 소유자 /preview라 무관)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_thread(p_counterpart uuid)
returns table (
  letter_id uuid,
  token     text,
  title     text,
  direction text,
  at        timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    -- 보냄: 내가 소유한 편지를 상대가 저장. token=null → /preview/:id(소유자 열람, revoke 무관).
    select l.id, null::text, l.title, 'sent'::text, i.saved_at
    from letters l
    join inbox i on i.letter_id = l.id
    where l.owner_id = auth.uid() and i.user_id = p_counterpart
    union all
    -- 받음: 상대가 소유한 편지를 내가 저장. /l/:token로 열람하므로 죽은 링크는 제외.
    select l.id, i.token, l.title, 'received'::text, i.saved_at
    from inbox i
    join letters l on l.id = i.letter_id
    join delivery_links dl on dl.token = i.token
      and dl.revoked = false
      and (dl.expires_at is null or dl.expires_at > now())
    where i.user_id = auth.uid() and l.owner_id = p_counterpart
    order by at;
end;
$$;
revoke all on function get_thread(uuid) from public;
grant execute on function get_thread(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-B. accept_connect_invite — 동시 수락 레이스 차단(advisory xact lock)
--   0013 본문 유지 + 당사자 두 유저에 락(least/greatest 순서로 데드락 회피) 후 배타성 검사.
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

  -- 동시 수락 직렬화: 두 당사자 uuid에 트랜잭션 advisory lock.
  -- least/greatest 순서로 잠가 데드락을 피한다. 같은 유저가 두 초대를 동시에 수락해도
  -- 한 트랜잭션이 끝날 때까지 다른 쪽이 대기 → 아래 배타성 검사가 신뢰 가능해진다.
  perform pg_advisory_xact_lock(hashtext(least(v_inviter, auth.uid())::text));
  perform pg_advisory_xact_lock(hashtext(greatest(v_inviter, auth.uid())::text));

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
