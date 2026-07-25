-- supabase/migrations/0032_app_config_android.sql
--
-- Android 강제 업데이트 시드 행. 0031_app_config의 app_config 테이블에 android 행을 추가한다.
-- 앱(Android)이 실행 시 min_version을 읽어 설치 버전(BuildConfig.VERSION_NAME)과 비교해 강제 업데이트를 결정.
-- min_version=0.1.0 이면 0.1.0 이상 전부 통과 — 아직 아무도 강제되지 않음(강제할 때 값을 올린다).
-- store_url은 Play 출시 후 실제 링크로 갱신(앱은 packageName 기반 Play 링크도 폴백으로 사용).

insert into app_config (platform, min_version, latest_version, store_url)
values (
  'android',
  '0.1.0',
  '0.1.0',
  'https://play.google.com/store/apps/details?id=com.efreedom.mutter'
)
on conflict (platform) do nothing;
