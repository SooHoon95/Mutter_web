-- supabase/migrations/0015_disable_audio_service_role_only.sql
--
-- P0 보안 수정: disable_letter_audio를 진짜 service_role(운영자) 전용으로 잠근다.
--
-- 결함(0012): 운영자 게이트를 `if auth.uid() is not null then FORBIDDEN`으로 구현했는데,
--   PostgREST의 **anon 역할도 auth.uid()가 NULL**이라 service_role과 구분되지 않는다.
--   0012가 authenticated의 execute만 revoke하고 anon은 남겨둬, 익명 호출자가 게이트를
--   통과해 security-definer UPDATE(audio_disabled=true)에 도달할 수 있었다(RLS 우회).
--   → 라이브 테스트에서 anon 호출이 FORBIDDEN이 아니라 LETTER_NOT_FOUND를 반환해 노출 확인.
--
-- 조치: 실행 권한을 GRANT 레벨에서 통제한다. public/anon/authenticated 전부 revoke하고
--   service_role에만 grant한다. 운영자는 service_role 키로만 호출(또는 직접 UPDATE).
--   본문의 `auth.uid() is not null → FORBIDDEN` 가드는 방어적으로 유지한다(이중 안전).

revoke execute on function disable_letter_audio(uuid) from public, anon, authenticated;
grant  execute on function disable_letter_audio(uuid) to service_role;
