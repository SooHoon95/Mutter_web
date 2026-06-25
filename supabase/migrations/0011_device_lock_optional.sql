-- supabase/migrations/0011_device_lock_optional.sql
-- (파일명은 레거시 — 내용은 "기기 잠금 완전 제거". 분류기 복구 후 파일명 정리 예정.)
--
-- 기기 잠금(claim-and-bind)을 **완전히 제거**한다. 옵션도 두지 않는다.
--
-- 문제: 0003/0004의 get_letter_by_token은 링크를 "처음 연 기기"에 영구 귀속시켜
--   한 명이 열면 다른 사람/다른 기기에서 못 열었다(정상 수신자도 차단).
--
-- 변경: get_letter_by_token에서 claim-and-bind 블록을 삭제한다.
--   이제 편지 링크는 추측불가 토큰 + (기본 ON) 암호 + 만료 + 무효화로만 보호되고,
--   누가·어느 기기서든·몇 번이든 열람 가능하다(멀티기기·기기변경·시크릿모드 OK).
--   p_device_id 파라미터는 클라이언트 호출 호환을 위해 시그니처에만 남기고 사용하지 않는다.
--   (delivery_links.claim_device_id / claimed_at 컬럼은 남겨두되 더 이상 기록/검사하지 않는다.)
--
-- 0005의 pgcrypto search_path 수정(public, extensions)을 재정의 시 보존한다.

create or replace function get_letter_by_token(
  p_token     text,
  p_password  text,
  p_device_id text   -- 미사용(기기 잠금 제거). 클라이언트 호환 위해 시그니처 유지.
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

  -- ④ 암호 비교 (서버 bcrypt)
  if v_link.password_hash is not null then
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑤ (기기 잠금 제거 — claim-and-bind 없음. 어느 기기서든 열람 가능.)

  -- ⑥ 편지 조회
  select * into v_letter from letters where id = v_link.letter_id;
  if not found then raise exception 'LETTER_NOT_FOUND'; end if;

  -- ⑦ 결과 (audio_disabled 포함, 민감 컬럼 제외)
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

revoke all on function get_letter_by_token(text, text, text) from public;
grant execute on function get_letter_by_token(text, text, text) to anon, authenticated;
