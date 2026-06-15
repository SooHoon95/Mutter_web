-- supabase/migrations/0004_takedowns.sql
--
-- T9 (US-009): 법적 안전장치 — takedown 채널
--
-- 변경 사항:
--   1. letters 테이블에 audio_disabled 컬럼 추가
--   2. takedowns 테이블 신규 생성
--   3. report_takedown RPC (anon execute — 익명 신고 허용)
--   4. disable_letter_audio RPC (운영자용 — authenticated only)
--   5. get_letter_by_token RPC를 재정의해 audio_disabled 페이로드 포함
--
-- 설계 원칙:
--   - 권리주장자 신고 insert는 익명 허용(report_takedown security definer).
--   - takedowns 읽기는 비공개(RLS: authenticated 소유자 조회도 열지 않음 — 운영자만).
--   - 오디오 비활성화는 본문을 유지하고 audio_disabled=true만 토글(법적 분리).
--   - get_letter_by_token은 audio_disabled를 페이로드에 포함해 클라이언트가 구분 렌더.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. letters 테이블 — audio_disabled 컬럼 추가
-- ─────────────────────────────────────────────────────────────────────────────
alter table letters
  add column if not exists audio_disabled boolean not null default false;

comment on column letters.audio_disabled is
  '권리주장자 takedown 통지 시 운영자가 disable_letter_audio()로 true로 설정한다. '
  '편지 본문은 유지하되 오디오만 비활성화된다.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. takedowns 테이블
--    권리주장자 신고 레코드. 읽기는 비공개(RLS로 anon/authenticated SELECT 차단).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists takedowns (
  id          uuid primary key default gen_random_uuid(),
  -- 대상 편지 (옵션 — 특정 편지가 아닌 일반 신고도 받는다)
  letter_id   uuid references letters(id) on delete set null,
  -- 트랙 참조 (SC URL 또는 카탈로그 ID 등 신고자가 기입)
  track_ref   text,
  -- 신고자 정보
  claimant    text not null,        -- 권리주장자 이름 또는 단체명
  contact     text not null,        -- 이메일 또는 연락처
  reason      text not null,        -- 신고 사유 (자유 텍스트)
  -- 처리 상태: pending → investigating → resolved / rejected
  status      text not null default 'pending'
                check (status in ('pending', 'investigating', 'resolved', 'rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists takedowns_letter_id_idx on takedowns(letter_id);
create index if not exists takedowns_status_idx on takedowns(status);
create index if not exists takedowns_created_at_idx on takedowns(created_at desc);

comment on table takedowns is
  'T9 US-009: 권리주장자 takedown 신고 레코드. '
  'anon이 report_takedown RPC를 통해 insert 가능. 직접 SELECT는 RLS로 차단.';

-- RLS 활성 — anon SELECT 전면 차단
alter table takedowns enable row level security;
alter table takedowns force row level security;

-- SELECT: 어떤 역할도 직접 읽기 불가 (운영자는 service role key로만 접근)
-- INSERT: 직접 insert 불가 — report_takedown security definer RPC를 통해서만
-- (의도적으로 정책을 추가하지 않아 모든 직접 DML 차단)

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. report_takedown RPC
--    권리주장자가 호출하는 공개 무인증 신고 채널.
--    anon도 호출 가능(security definer 내부에서만 insert).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function report_takedown(
  p_letter_id uuid,    -- 대상 편지 ID (없으면 NULL)
  p_track_ref text,    -- 대상 트랙 참조 (없으면 NULL)
  p_claimant  text,    -- 권리주장자 이름 (필수)
  p_contact   text,    -- 연락처 이메일 (필수)
  p_reason    text     -- 신고 사유 (필수)
)
returns uuid            -- 생성된 takedown 레코드 id 반환
language plpgsql
security definer        -- anon이 호출해도 takedowns에 insert 가능
set search_path = public
as $$
declare
  v_id uuid;
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

-- anon + authenticated 모두 호출 가능 (공개 신고 채널)
revoke all on function report_takedown(uuid, text, text, text, text) from public;
grant execute on function report_takedown(uuid, text, text, text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. disable_letter_audio RPC (운영자 전용)
--    takedown 통지를 검토한 후 운영자가 편지 오디오를 비활성화한다.
--    authenticated + 소유자 검증. 서비스 롤에서는 직접 UPDATE도 가능.
--
--    운영 흐름:
--      1. takedowns 테이블을 서비스 롤 키로 조회해 신고를 확인한다.
--      2. 해당 letter_id로 disable_letter_audio()를 authenticated 세션에서 호출한다.
--         (또는 서비스 롤로 직접 UPDATE letters SET audio_disabled=true WHERE id=?)
--      3. takedowns.status를 'resolved'로 갱신한다.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function disable_letter_audio(
  p_letter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  -- 편지 존재 및 소유자 확인 (RLS 우회 — security definer이므로 수동 검증)
  select owner_id into v_owner_id
    from letters
   where id = p_letter_id;

  if v_owner_id is null then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  -- 호출자가 소유자이거나 서비스 롤(auth.uid() IS NULL)인 경우만 허용
  if auth.uid() is not null and auth.uid() <> v_owner_id then
    raise exception 'FORBIDDEN';
  end if;

  update letters
     set audio_disabled = true
   where id = p_letter_id;
end;
$$;

-- authenticated 사용자(편지 소유자)만 직접 호출 가능
-- 서비스 롤(운영자)은 auth.uid() IS NULL로 통과
revoke all on function disable_letter_audio(uuid) from public;
grant execute on function disable_letter_audio(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. get_letter_by_token RPC 재정의 — audio_disabled 페이로드 포함
--
--    0003_links_rpc.sql의 get_letter_by_token을 교체한다.
--    검증 로직은 동일하고 반환 JSON에 audio_disabled만 추가.
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
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑤ claim-and-bind (원자적 UPDATE로 TOCTOU 제거)
  update delivery_links
     set claim_device_id = p_device_id,
         claimed_at      = now()
   where token = p_token
     and claim_device_id is null;

  get diagnostics v_claimed_rows = row_count;

  if v_claimed_rows = 0 then
    select claim_device_id into v_current_claim
      from delivery_links
     where token = p_token;

    if v_current_claim is distinct from p_device_id then
      raise exception 'DEVICE_MISMATCH';
    end if;
  end if;

  -- ⑥ 편지 조회
  select * into v_letter
    from letters
   where id = v_link.letter_id;

  if not found then
    raise exception 'LETTER_NOT_FOUND';
  end if;

  -- ⑦ 결과 반환 — audio_disabled 포함 (T9 추가), password_hash 등 민감 컬럼 제외
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

-- anon + authenticated 모두 호출 가능 (수신 경로는 무인증)
revoke all on function get_letter_by_token(text, text, text) from public;
grant execute on function get_letter_by_token(text, text, text) to anon, authenticated;
