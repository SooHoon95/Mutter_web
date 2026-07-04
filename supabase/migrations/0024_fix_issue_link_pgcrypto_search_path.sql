-- supabase/migrations/0024_fix_issue_link_pgcrypto_search_path.sql
--
-- 회귀 수정: 암호가 걸린 전달 링크 발급 실패("암호 생성하면 안 보내짐").
--
-- 원인: 0005에서 issue_link의 search_path에 extensions를 추가해(pgcrypto가 extensions
--       스키마에 있음) 암호 해시를 고쳤는데, 0018(예약 공개)에서 issue_link를 재정의하며
--       `set search_path = public`만 써서 extensions를 다시 빠뜨렸다. 그 결과 암호가 있으면
--       crypt()/gen_salt()를 찾지 못해 함수가 실패한다(암호 없으면 그 분기를 안 타 정상).
--
-- 해결: 0018 본문 그대로, search_path만 `public, extensions`로 재정의(create or replace).

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
set search_path = public, extensions
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

  -- 암호가 있으면 bcrypt 해시 (blowfish, cost 10) — crypt/gen_salt는 extensions 스키마.
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
