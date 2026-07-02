-- supabase/migrations/0022_xplat_edge_hardening.sql
--
-- 크로스플랫폼 엣지케이스 하드닝 (Task #8, xplat edge hardening).
-- 웹·iOS 공통 경로에서 발생하는 엣지케이스를 서버 함수 레벨에서 차단한다.
--
-- EC-2.2  수락된 초대 재사용 차단: accept_connect_invite / get_connect_invite 에
--         accepted_by IS NOT NULL 가드 추가 → 이미 사용된 초대로 "수락" UI 노출 방지.
-- EC-1.7  만료된 링크로 save_to_inbox 진입 차단: revoke 검사 직후 expires_at 검사 추가.
-- EC-3.6  get_letter_by_token 로그인 수신자 자동 받은함 저장:
--         모든 게이트 통과 후 비소유자 로그인 사용자를 inbox에 upsert.
--         무계정 수신자는 저장 없음(무마찰). 웹·앱 동일 경로.
-- EC-2.8  revoke_connect_invite 신규 함수: 초대 발급자가 아직 수락 안 된 초대를 취소.
-- 레거시  connection_invites.expires_at NULL 행에 7일 만료 백필(기수락 행 제외).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. [EC-2.2] accept_connect_invite — 이미 수락된 초대 재사용 차단
--    0020 본문(advisory lock least/greatest 포함) 유지 + accepted_by 가드 추가.
--    expires_at 필터(만료 검사)를 먼저 통과하면 accepted_by 검사 진입:
--      - 만료+수락인 경우 → expires_at 필터에서 이미 INVITE_NOT_FOUND(의도적).
--      - 미만료+수락인 경우 → INVITE_ALREADY_USED.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function accept_connect_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inviter  uuid;
  v_invite   connection_invites;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  -- [EC-2.2] 초대 행 전체를 가져온다(accepted_by 포함 검사를 위해).
  select * into v_invite
  from connection_invites
  where token = p_token
    and (expires_at is null or expires_at > now());
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;

  -- [EC-2.2] 이미 수락된 초대는 재사용 불가.
  if v_invite.accepted_by is not null then raise exception 'INVITE_ALREADY_USED'; end if;

  v_inviter := v_invite.inviter_id;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. [EC-2.2] get_connect_invite — 이미 수락된 초대를 "수락" UI 대신 에러로 반환
--    0013 본문 유지 + accepted_by IS NOT NULL 가드 추가.
--    만료된 초대는 기존대로 INVITE_NOT_FOUND(expires_at 필터에서 처리됨).
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
declare
  v_inviter uuid;
  v_invite  connection_invites;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  -- 만료되지 않은 초대만 유효(expires_at NULL은 무기한 — 기존 행 호환).
  select * into v_invite
  from connection_invites ci
  where ci.token = p_token
    and (ci.expires_at is null or ci.expires_at > now());
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;

  -- [EC-2.2] 이미 수락된 초대는 "이미 사용된 초대"로 차단(수락 UI 노출 방지).
  if v_invite.accepted_by is not null then raise exception 'INVITE_ALREADY_USED'; end if;

  v_inviter := v_invite.inviter_id;
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
-- 3. [EC-1.7] save_to_inbox — 만료된 링크로 저장 시도 차단
--    0006 본문 유지 + revoke 검사 직후 expires_at 게이트 추가.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function save_to_inbox(p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_link delivery_links;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;
  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;

  -- [EC-1.7] 만료된 링크는 저장 불가(편지 자체를 열 수 없으므로 받은함에 넣어도 무의미).
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;

  insert into inbox (user_id, letter_id, token)
  values (auth.uid(), v_link.letter_id, p_token)
  on conflict (user_id, letter_id)
    do update set token = excluded.token, saved_at = now();
end;
$$;
revoke all on function save_to_inbox(text) from public;
grant execute on function save_to_inbox(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. [EC-3.6, 사용자 결정] get_letter_by_token(text,text) — 로그인 수신자 자동 받은함 저장
--    0018 본문 유지(2-arg 시그니처, anon+authenticated grant 유지).
--    모든 게이트(revoke/expiry/reveal_at/password) 통과 후,
--    로그인 상태 && 비소유자이면 inbox에 upsert → 웹·iOS 공통 경로.
--    무계정 수신자는 auth.uid() IS NULL이므로 저장 없음(무마찰 유지).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_letter_by_token(
  p_token    text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link   delivery_links;
  v_letter letters;
  v_result json;
begin
  -- ① 토큰 조회
  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  -- ② revoke
  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;

  -- ③ expiry
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;

  -- ③-b 예약 공개: reveal_at이 미래면 본문/암호 이전에 차단(공개 시각을 ISO로 전달).
  if v_link.reveal_at is not null and v_link.reveal_at > now() then
    raise exception 'NOT_YET_REVEALED:%',
      to_char(v_link.reveal_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  -- ④ 암호 비교 (서버 bcrypt)
  if v_link.password_hash is not null then
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑤ 편지 조회
  select * into v_letter from letters where id = v_link.letter_id;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;

  -- ⑥ 결과 (audio_disabled 포함, 민감 컬럼 제외)
  v_result := json_build_object(
    'id',             v_letter.id,
    'title',          v_letter.title,
    'paragraphs',     v_letter.paragraphs,
    'template_id',    v_letter.template_id,
    'cues',           '[]'::json,
    'audio_disabled', v_letter.audio_disabled
  );

  -- ⑦ [EC-3.6] 로그인 수신자 자동 받은함 저장.
  --    로그인 상태(auth.uid() IS NOT NULL) && 편지 소유자가 아닌 경우에만 upsert.
  --    무계정 수신자는 auth.uid() IS NULL → 이 블록을 건너뜀(무마찰 정책 유지).
  if auth.uid() is not null and auth.uid() <> v_letter.owner_id then
    insert into inbox (user_id, letter_id, token)
    values (auth.uid(), v_letter.id, p_token)
    on conflict (user_id, letter_id)
      do update set token = excluded.token, saved_at = now();
  end if;

  return v_result;
end;
$$;

revoke all on function get_letter_by_token(text, text) from public;
grant execute on function get_letter_by_token(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. [EC-2.8] revoke_connect_invite — 발급자가 아직 수락 안 된 초대를 취소
--    accepted_by IS NOT NULL인 행(이미 수락)은 삭제 대상에서 제외 → INVITE_NOT_FOUND.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function revoke_connect_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  -- 본인이 발급했고 아직 수락되지 않은 초대만 삭제 대상(수락된 초대는 삭제 불가).
  delete from connection_invites
  where token = p_token
    and inviter_id = auth.uid()
    and accepted_by is null;

  -- 위 DELETE가 0건이면 초대가 없거나(토큰 불일치), 타인 초대이거나, 이미 수락된 초대.
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
end;
$$;
revoke all on function revoke_connect_invite(text) from public;
grant execute on function revoke_connect_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. [EC-2.3] 레거시 백필: expires_at NULL이고 아직 수락 안 된 초대에 7일 만료 부여.
--    기수락 행(accepted_by IS NOT NULL)은 이미 닫혔으므로 만료 부여 의미 없음 → 제외.
-- ─────────────────────────────────────────────────────────────────────────────
update connection_invites
set expires_at = now() + interval '7 days'
where expires_at is null
  and accepted_by is null;
