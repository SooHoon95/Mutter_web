-- supabase/migrations/0012_takedown_hardening.sql
--
-- T9 법적 안전 강화 — "법적 안전은 반쯤 만들지 않는다"
--
-- 변경 사항:
--   1. [P1] disable_letter_audio — 소유자 자가 호출 경로 제거, 운영자/서비스 롤 전용으로
--      재정의. authenticated grant를 명시적으로 revoke.
--   2. [P1] report_takedown — 신고 사유 최소 길이(20자) 강제 + 동일 연락처 60초 중복
--      신고 rate-limit 추가. 기존 signature·security definer·익명 insert 설계 유지.
--   3. [P1] revoke_link (0003) — search_path에 extensions 추가 (방어적 표준; 0005와 동일
--      이유). 동작 동일.
--   4. [P1] disable_letter_audio (위 #1과 동일 함수) — search_path에 extensions 추가.
--
-- 적용 방법: supabase db push (운영자가 직접 실행)
-- 이 마이그레이션은 idempotent하다 (create or replace / revoke 중복 safe).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. revoke_link — search_path에 extensions 추가 (방어적 표준)
--    원본 signature: revoke_link(p_token text)  [0003_links_rpc.sql]
--    동작 변경 없음 — search_path = public, extensions 으로만 교체.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function revoke_link(
  p_token text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
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

-- grant는 0003에서 이미 발급됨; 재발급해 idempotent하게 유지
revoke all on function revoke_link(text) from public;
grant execute on function revoke_link(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. disable_letter_audio — 운영자/서비스 롤 전용으로 재정의
--    원본 signature: disable_letter_audio(p_letter_id uuid)  [0004_takedowns.sql]
--
--    0004의 원본은 "auth.uid() IS NULL(서비스롤) 또는 편지 소유자"를 허용했다.
--    이는 의도치 않게 발신자(sender)가 자신의 편지 오디오를 스스로 비활성화할 수 있는
--    경로를 열어 놓는다. Takedown 처리는 반드시 운영자가 검토한 뒤에만 이루어져야 하므로
--    소유자 자가 호출 경로를 제거한다.
--
--    새 동작:
--      - auth.uid() IS NULL (서비스 롤 / Edge Function): 허용
--      - auth.uid() IS NOT NULL (모든 authenticated 사용자, 소유자 포함): FORBIDDEN
--
--    search_path = public, extensions (방어적 표준 — #1과 동일 이유).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function disable_letter_audio(
  p_letter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 운영자(서비스 롤, auth.uid() IS NULL)만 호출 가능.
  -- authenticated 사용자(편지 소유자 포함)는 이 경로를 직접 호출할 수 없다.
  -- takedown은 반드시 운영자가 검토 후 서비스 롤 키로 실행한다.
  if auth.uid() is not null then
    raise exception 'FORBIDDEN';
  end if;

  -- 편지 존재 확인 (security definer이므로 RLS 우회 — 명시적 검증)
  if not exists (select 1 from letters where id = p_letter_id) then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  update letters
     set audio_disabled = true
   where id = p_letter_id;
end;
$$;

-- authenticated grant를 명시적으로 revoke — 소유자 자가 호출 경로 차단.
-- 서비스 롤은 auth.uid() IS NULL로 security definer 내부를 통과한다(grant 불필요).
revoke all on function disable_letter_audio(uuid) from public;
revoke execute on function disable_letter_audio(uuid) from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. report_takedown — 신고 사유 최소 길이 + rate-limit 추가
--    원본 signature: report_takedown(p_letter_id uuid, p_track_ref text,
--                                    p_claimant text, p_contact text, p_reason text)
--                   [0004_takedowns.sql]
--
--    추가된 검증:
--      a) p_reason trim 후 20자 미만 → REASON_TOO_SHORT 예외
--         (1자짜리 의미없는 신고로 법적 채널이 오염되는 것을 방지)
--      b) 동일 contact(trim 후)로 60초 이내 takedown이 이미 존재하면 → RATE_LIMITED 예외
--         (자동화 도구로 채널을 flooding하는 것을 방지)
--
--    기존 설계 유지:
--      - security definer (anon insert 허용)
--      - 기존 필수 필드 검증 (CLAIMANT_REQUIRED, CONTACT_REQUIRED, REASON_REQUIRED)
--      - letter_id 유효성 검사
--      - search_path = public (pgcrypto 사용 없음 — extensions 불필요)
--      - anon + authenticated grant
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function report_takedown(
  p_letter_id uuid,    -- 대상 편지 ID (없으면 NULL)
  p_track_ref text,    -- 대상 트랙 참조 (없으면 NULL)
  p_claimant  text,    -- 권리주장자 이름 (필수)
  p_contact   text,    -- 연락처 이메일 (필수)
  p_reason    text     -- 신고 사유 (필수, 최소 20자)
)
returns uuid            -- 생성된 takedown 레코드 id 반환
language plpgsql
security definer        -- anon이 호출해도 takedowns에 insert 가능
set search_path = public
as $$
declare
  v_id            uuid;
  v_recent_count  int;
begin
  -- 필수 필드 유효성 검사
  if p_claimant is null or trim(p_claimant) = '' then
    raise exception 'CLAIMANT_REQUIRED';
  end if;
  if p_contact is null or trim(p_contact) = '' then
    raise exception 'CONTACT_REQUIRED';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  -- [신규] 신고 사유 최소 길이 검증 (20자 미만은 의미있는 신고로 보기 어렵다)
  if length(trim(p_reason)) < 20 then
    raise exception 'REASON_TOO_SHORT';
  end if;

  -- [신규] 동일 연락처 60초 이내 중복 신고 rate-limit
  --   security definer이므로 RLS를 우회해 takedowns를 직접 조회할 수 있다.
  select count(*) into v_recent_count
    from takedowns
   where contact = trim(p_contact)
     and created_at > now() - interval '60 seconds';

  if v_recent_count > 0 then
    raise exception 'RATE_LIMITED';
  end if;

  -- letter_id 유효성 검사 (제공된 경우 실재하는 편지인지)
  if p_letter_id is not null then
    if not exists (select 1 from letters where id = p_letter_id) then
      raise exception 'LETTER_NOT_FOUND';
    end if;
  end if;

  insert into takedowns (letter_id, track_ref, claimant, contact, reason)
  values (p_letter_id, p_track_ref, trim(p_claimant), trim(p_contact), trim(p_reason))
  returning id into v_id;

  return v_id;
end;
$$;

-- anon + authenticated 모두 호출 가능 (공개 신고 채널) — 0004와 동일
revoke all on function report_takedown(uuid, text, text, text, text) from public;
grant execute on function report_takedown(uuid, text, text, text, text) to anon, authenticated;
