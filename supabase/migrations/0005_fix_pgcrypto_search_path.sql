-- supabase/migrations/0005_fix_pgcrypto_search_path.sql
--
-- 버그 수정: 암호 보호 링크 발급/검증 실패.
--
-- 원인: Supabase는 pgcrypto(crypt, gen_salt)를 'extensions' 스키마에 설치한다.
-- security definer 함수의 search_path가 'public'뿐이라 crypt()/gen_salt()를 찾지 못해
-- 암호 해시 생성(issue_link)·비교(get_letter_by_token)가 런타임 에러로 실패했다.
--
-- 해결: 암호를 쓰는 함수의 search_path에 extensions를 추가한다.
-- (public을 먼저 둬 우리 테이블/타입 해석은 그대로 유지)

alter function public.issue_link(uuid, text, text, timestamptz)
  set search_path = public, extensions;

alter function public.get_letter_by_token(text, text, text)
  set search_path = public, extensions;
