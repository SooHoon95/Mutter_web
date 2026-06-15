-- supabase/migrations/0003_links_rpc.sql
--
-- T7 (US-007): 전달 링크 + 프라이버시 — Security Definer RPC
--
-- pgcrypto: 암호 해시(bcrypt/blowfish) + 비교를 서버에서만 처리.
-- anon은 이 RPC를 통해서만 편지에 접근할 수 있다.
-- letters / delivery_links 직접 SELECT는 RLS로 막혀 있다(0002 유지).
--
-- 보안 수정 (보안 리뷰):
--   H-1: revoke_link RPC 추가 — 소유권을 서버에서 검증, 클라이언트 직접 UPDATE 제거
--   M-1: claim-and-bind 원자적 UPDATE로 TOCTOU 제거
--   M-2: issue_link에 토큰 형식 서버 검증 추가
--   M-3: revoke_link가 revoked_at 타임스탬프도 함께 설정

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. pgcrypto 확장 (bcrypt hash용)
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. issue_link RPC
--    발신자가 링크를 발급할 때 호출한다. 암호 평문을 받아 서버에서 bcrypt 해시한다.
--    클라이언트는 절대 해시 처리를 하지 않는다.
--    M-2: 토큰 형식을 서버에서 검증한다.
--    호출 권한: authenticated (발신자 세션 필요)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function issue_link(
  p_letter_id  uuid,
  p_token      text,
  p_password   text,       -- NULL이면 암호 없음
  p_expires_at timestamptz -- NULL이면 만료 없음
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
  -- 호출자 = 편지 소유자 검증 (RLS를 우회하므로 수동으로 ownership 확인)
  select owner_id into v_owner_id
    from letters
   where id = p_letter_id;

  if v_owner_id is null then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  if v_owner_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  -- M-2: 토큰 형식 서버 검증 (클라이언트가 보낸 토큰이 요건을 충족하는지)
  if length(p_token) < 22 then
    raise exception 'TOKEN_TOO_SHORT';
  end if;
  if p_token !~ '^[A-Za-z0-9_\-]+$' then
    raise exception 'TOKEN_INVALID_FORMAT';
  end if;

  -- 암호가 있으면 bcrypt 해시 (blowfish, cost 10)
  if p_password is not null and p_password <> '' then
    v_hash := crypt(p_password, gen_salt('bf'));
  else
    v_hash := null;
  end if;

  -- delivery_links 삽입
  insert into delivery_links (
    letter_id, owner_id, token, password_hash, expires_at
  ) values (
    p_letter_id, v_owner_id, p_token, v_hash, p_expires_at
  )
  returning * into v_row;

  return next v_row;
end;
$$;

-- authenticated 사용자(발신자)만 호출 가능
revoke all on function issue_link(uuid, text, text, timestamptz) from public;
grant execute on function issue_link(uuid, text, text, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. revoke_link RPC  (H-1 신규)
--    발신자가 링크를 무효화할 때 호출한다.
--    소유권을 서버에서 검증하므로 클라이언트 직접 UPDATE가 필요 없다.
--    M-3: revoked_at 타임스탬프도 함께 설정한다.
--    호출 권한: authenticated (발신자 세션 필요)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function revoke_link(
  p_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  -- 토큰 존재 및 소유자 확인
  select owner_id into v_owner_id
    from delivery_links
   where token = p_token;

  if v_owner_id is null then
    raise exception 'TOKEN_NOT_FOUND';
  end if;

  if v_owner_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  -- H-1: 소유권 확인 후 revoke (M-3: revoked_at도 설정)
  update delivery_links
     set revoked    = true,
         revoked_at = now()
   where token = p_token;
end;
$$;

-- authenticated 사용자(발신자)만 호출 가능
revoke all on function revoke_link(text) from public;
grant execute on function revoke_link(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_letter_by_token RPC
--    수신자가 링크를 열 때 호출한다 (anon 포함).
--    검증 순서: 토큰 조회 → revoke/expiry → 암호 비교 → claim-and-bind(원자적) → 편지 반환
--    M-1: claim-and-bind를 원자적 UPDATE로 구현해 TOCTOU race condition 제거.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function get_letter_by_token(
  p_token     text,
  p_password  text,   -- 암호 없으면 NULL
  p_device_id text    -- claim-and-bind용 기기 식별자
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link          delivery_links;
  v_claimed_rows  int;
  v_current_claim text;
  v_letter        letters;
  v_result        json;
begin
  -- ① 토큰으로 링크 조회
  select * into v_link
    from delivery_links
   where token = p_token;

  if not found then
    raise exception 'TOKEN_NOT_FOUND';
  end if;

  -- ② revoke 체크
  if v_link.revoked then
    raise exception 'LINK_REVOKED';
  end if;

  -- ③ expiry 체크
  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'LINK_EXPIRED';
  end if;

  -- ④ 암호 비교 (서버 bcrypt — 클라이언트에 해시 미반환)
  if v_link.password_hash is not null then
    -- p_password가 NULL이거나 해시 불일치 → 거부
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑤ claim-and-bind (M-1: 원자적 UPDATE로 TOCTOU 제거)
  --    claim_device_id IS NULL인 경우에만 바인딩을 시도한다.
  --    동시에 두 요청이 들어와도 DB가 한 쪽만 성공시킨다.
  update delivery_links
     set claim_device_id = p_device_id,
         claimed_at      = now()
   where token = p_token
     and claim_device_id is null;

  get diagnostics v_claimed_rows = row_count;

  if v_claimed_rows = 0 then
    -- 이미 claim됨 → 현재 바인딩된 device id 확인
    select claim_device_id into v_current_claim
      from delivery_links
     where token = p_token;

    if v_current_claim is distinct from p_device_id then
      raise exception 'DEVICE_MISMATCH';
    end if;
    -- 같은 device id면 통과 (재열람)
  end if;

  -- ⑥ 편지 조회 (security definer이므로 RLS 우회 — ownership 검증은 링크로 이미 통과)
  select * into v_letter
    from letters
   where id = v_link.letter_id;

  if not found then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  -- ⑦ 결과 반환 (본문만, password_hash 등 민감 컬럼 제외)
  v_result := json_build_object(
    'id',          v_letter.id,
    'title',       v_letter.title,
    'paragraphs',  v_letter.paragraphs,
    'template_id', v_letter.template_id,
    'cues',        '[]'::json
  );

  return v_result;
end;
$$;

-- anon + authenticated 모두 호출 가능 (수신 경로는 무인증)
revoke all on function get_letter_by_token(text, text, text) from public;
grant execute on function get_letter_by_token(text, text, text) to anon, authenticated;
