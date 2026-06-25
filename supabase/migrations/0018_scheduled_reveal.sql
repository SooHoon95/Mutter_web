-- supabase/migrations/0018_scheduled_reveal.sql
--
-- 날짜에 열리는 편지(예약 공개): 전달 링크에 reveal_at(공개 가능 시각)을 둔다.
-- reveal_at 이전에는 본문/암호 단계 이전에 "아직 열 수 없는 편지"로 막고,
-- 그 시각 이후에는 평소대로 열린다. 생일·기념일·디데이 편지에 쓴다.
--
-- 무중단(zero-downtime): issue_link에 p_reveal_at을 추가하되 DEFAULT NULL로 두고
--   기존 4-arg 함수는 DROP한다. 그러면 함수가 하나만 남아(5-arg, 마지막 인자 default),
--   배포 윈도우 동안 구(舊) 클라이언트의 4-arg 호출은 p_reveal_at이 기본값으로 채워져
--   그대로 동작한다(PostgREST가 제공된 인자 이름만 매칭). 5-arg 두 개 공존 시의
--   "function is not unique" 모호성을 피하려 단일 함수로 둔다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. delivery_links.reveal_at 컬럼
-- ─────────────────────────────────────────────────────────────────────────────
alter table delivery_links add column if not exists reveal_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. issue_link 재정의 — p_reveal_at(예약 공개 시각) 추가
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists issue_link(uuid, text, text, timestamptz);

create or replace function issue_link(
  p_letter_id  uuid,
  p_token      text,
  p_password   text,        -- NULL이면 암호 없음
  p_expires_at timestamptz, -- NULL이면 만료 없음
  p_reveal_at  timestamptz default null  -- NULL이면 즉시 공개(예약 없음)
)
returns setof delivery_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_hash     text;
  v_row      delivery_links;
begin
  -- 호출자 = 편지 소유자 검증 (RLS 우회이므로 수동 확인)
  select owner_id into v_owner_id from letters where id = p_letter_id;
  if v_owner_id is null then raise exception 'LETTER_NOT_FOUND'; end if;
  if v_owner_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;

  -- M-2: 토큰 형식 서버 검증
  if length(p_token) < 22 then raise exception 'TOKEN_TOO_SHORT'; end if;
  if p_token !~ '^[A-Za-z0-9_\-]+$' then raise exception 'TOKEN_INVALID_FORMAT'; end if;

  -- 암호가 있으면 bcrypt 해시 (blowfish, cost 10)
  if p_password is not null and p_password <> '' then
    v_hash := crypt(p_password, gen_salt('bf'));
  else
    v_hash := null;
  end if;

  insert into delivery_links (
    letter_id, owner_id, token, password_hash, expires_at, reveal_at
  ) values (
    p_letter_id, v_owner_id, p_token, v_hash, p_expires_at, p_reveal_at
  )
  returning * into v_row;

  return next v_row;
end;
$$;

revoke all on function issue_link(uuid, text, text, timestamptz, timestamptz) from public;
grant execute on function issue_link(uuid, text, text, timestamptz, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_letter_by_token (2-arg) 재정의 — reveal_at 게이트 추가
--    0014 본문 + expiry 직후 reveal_at 체크. reveal_at이 미래면 본문/암호 이전에 차단.
--    공개 시각을 클라이언트가 표시하도록 ISO8601(UTC)로 인코딩해 예외 메시지에 싣는다.
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
  return v_result;
end;
$$;

revoke all on function get_letter_by_token(text, text) from public;
grant execute on function get_letter_by_token(text, text) to anon, authenticated;
