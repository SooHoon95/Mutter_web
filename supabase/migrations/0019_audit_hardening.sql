-- supabase/migrations/0019_audit_hardening.sql
--
-- 전수 점검(audit sweep)에서 확정된 결함 수정.
--
-- P0-1) 예약 공개(reveal_at) 우회: 0018은 get_letter_by_token의 2-arg만 reveal_at 게이트를
--   추가했고, 0011의 구(舊) 3-arg 오버로드는 그대로 남아 있었다. 3-arg를 직접 호출하면
--   reveal_at 검사 없이 본문을 열람할 수 있다(토큰 보유자가 공개 시각 전에 우회 가능).
--   현재 클라이언트는 2-arg만 호출하므로 3-arg를 제거한다.
--
-- P0-2) 링크 목록 로드 불능: listLinks가 `(password_hash IS NOT NULL) AS has_password`를
--   PostgREST select에 넣었으나 PostgREST는 raw SQL 표현식을 지원하지 않아 PGRST100(400).
--   password_hash 원문을 클라이언트에 노출하지 않으면서 boolean을 얻기 위해 **생성 컬럼**을 둔다.
--
-- P1) record_letter_open이 reveal_at(미공개) 링크에도 open을 기록 → 발신자가 공개 전
--   "열어봤어요"를 보게 됨. expiry와 동일하게 reveal_at 미래면 기록하지 않는다.

-- ─────────────────────────────────────────────────────────────────────────────
-- P0-1. 구 3-arg get_letter_by_token 제거 (reveal_at 우회 경로 차단)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists get_letter_by_token(text, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- P0-2. delivery_links.has_password 생성 컬럼
--   password_hash 존재 여부를 실 컬럼으로 노출(원문은 노출 안 함). PostgREST가 직접 select.
-- ─────────────────────────────────────────────────────────────────────────────
alter table delivery_links
  add column if not exists has_password boolean
  generated always as (password_hash is not null) stored;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1. record_letter_open에 reveal_at 가드 추가 (미공개 링크엔 기록 안 함)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function record_letter_open(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_link delivery_links;
begin
  select * into v_link from delivery_links where token = p_token;
  if not found then return; end if;
  if v_link.revoked then return; end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then return; end if;
  -- 예약 공개 전이면 아직 "열림"이 아니다 — 기록하지 않는다.
  if v_link.reveal_at is not null and v_link.reveal_at > now() then return; end if;

  insert into letter_opens (token, letter_id, first_opened_at, last_opened_at, open_count)
  values (p_token, v_link.letter_id, now(), now(), 1)
  on conflict (token) do update
    set last_opened_at = now(),
        open_count     = letter_opens.open_count + 1;
end;
$$;

revoke all on function record_letter_open(text) from public;
grant execute on function record_letter_open(text) to anon, authenticated;
