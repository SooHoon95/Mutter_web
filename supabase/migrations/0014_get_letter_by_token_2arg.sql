-- supabase/migrations/0014_get_letter_by_token_2arg.sql
--
-- get_letter_by_token에서 미사용 p_device_id 파라미터를 완전히 제거한다(2-arg).
--
-- 배경: 0011에서 claim-and-bind(기기 잠금)를 제거하면서 p_device_id를 "클라이언트 호환"
--   목적으로 시그니처에만 남겨두었다. 이후 클라이언트(openByToken)에서 device 코드를
--   완전히 삭제해 이제 RPC를 2-arg(p_token, p_password)로 호출한다.
--   PostgREST는 제공된 인자 이름 집합으로 함수를 매칭하므로, 배포된 3-arg 함수
--   (p_device_id 기본값 없음)는 2-arg 호출과 매칭되지 않아 수신 경로 전체가 깨진다(PGRST202).
--
-- 조치(무중단): 기존 3-arg 함수는 **그대로 두고** 2-arg 오버로드를 추가한다.
--   PostgreSQL은 인자 개수로 오버로딩을 구분하므로 두 시그니처가 공존하며,
--   PostgREST는 각 클라이언트 호출을 알맞은 함수로 매칭한다.
--     - 구(舊) 클라이언트(현재 라이브, 3-arg 호출) → 기존 3-arg 함수 사용(0011)
--     - 신(新) 클라이언트(2-arg 호출)              → 이 2-arg 함수 사용
--   따라서 push/deploy 순서와 무관하게 수신 경로가 깨지지 않는다(zero-downtime).
--   배포 완료 후 3-arg 함수는 사용되지 않으므로 추후 정리 마이그레이션에서 drop 가능.
--   검증 로직(토큰/revoke/expiry/암호)은 0011과 동일하며 device 부분만 없다.
--   0005의 search_path(public, extensions)를 보존한다.

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

  -- ④ 암호 비교 (서버 bcrypt)
  if v_link.password_hash is not null then
    if p_password is null or crypt(p_password, v_link.password_hash) <> v_link.password_hash then
      raise exception 'WRONG_PASSWORD';
    end if;
  end if;

  -- ⑤ (기기 잠금 제거 — 어느 기기서든 열람 가능)

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

revoke all on function get_letter_by_token(text, text) from public;
grant execute on function get_letter_by_token(text, text) to anon, authenticated;
