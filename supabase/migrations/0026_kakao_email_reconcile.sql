-- supabase/migrations/0026_kakao_email_reconcile.sql
--
-- 카카오 로그인 이메일 기준 재조정(계정 통일).
--
-- 원칙 변경: 유저의 유니크 키 = 이메일. 같은 이메일이면 로그인 수단(카카오/구글/이메일)이
--   무엇이든 같은 회원이다. (닉네임은 상대에게 보이는 표시용일 뿐 신원이 아니다.)
--
-- 이전 정책(0023 R2): "구글↔카카오는 이메일이 같아도 별도 계정, 병합 금지(Edge가 409 차단)".
--   → 그 결과 웹(내장 카카오 OAuth로 가입) 계정이 있는 사람이 앱에서 카카오를 누르면
--     Edge가 새 유저 생성(email UNIQUE) 실패 → "다른 로그인 방식으로 가입" 409로 막혔다.
--
-- 전환: Edge Function `kakao-login`이 새 유저 생성에 실패(이메일 중복)하면, 그 이메일의
--   기존 유저를 찾아 그 계정으로 로그인시키고 sub→user_id 매핑에 흡수한다.
--   이 마이그레이션은 그 "이메일로 유저 찾기"를 service_role 전용 헬퍼로 제공한다.
--
-- 안전성: 카카오 idToken은 Edge에서 서명·발급자·대상·만료를 검증하며, 그 email 클레임은
--   카카오가 확인한 값이다. 구글/이메일 계정의 이메일도 Supabase에서 확인된 값이므로,
--   "검증된 이메일끼리의 병합"이라 계정 탈취 위험이 없다.

-- ─────────────────────────────────────────────────────────────────────────────
-- find_user_id_by_email: 이메일(대소문자 무시)로 auth.users의 user_id를 찾는다.
--   - auth 스키마는 PostgREST에 노출되지 않으므로 SECURITY DEFINER 함수로 감싼다.
--   - service_role(Edge Function)만 실행 가능. anon/authenticated는 전면 차단
--     (이메일→user_id 매핑은 신원 정보라 클라이언트에 절대 노출하지 않는다).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;
