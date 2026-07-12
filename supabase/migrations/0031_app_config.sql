-- supabase/migrations/0031_app_config.sql
--
-- 앱 원격 설정(강제 업데이트). 플랫폼별 최소 요구 버전 + 스토어 URL을 앱이 실행 시 읽어
-- 설치 버전과 비교해 강제 업데이트를 결정한다.
-- - 읽기: anon 포함 누구나 — 앱은 로그인 전에도 버전을 확인해 차단할 수 있어야 한다.
-- - 쓰기: 정책 없음 = service role/대시보드 전용(운영자가 min_version만 올려 강제).

create table if not exists app_config (
  platform       text primary key,             -- 'ios' | 'android' | 'web'
  min_version    text not null,                -- 이 버전 미만이면 강제 업데이트 (semver, 예 '1.0.0')
  latest_version text,                          -- 최신 버전(참고/권장, 선택)
  store_url      text not null,                -- 업데이트 유도 대상(App Store 링크)
  updated_at     timestamptz not null default now()
);

comment on table app_config is '앱 원격 설정 — 플랫폼별 강제 업데이트 최소 버전/스토어 URL';

alter table app_config enable row level security;

-- 공개 읽기(로그인 전에도 버전 확인 필요). 쓰기 정책은 두지 않는다 → service role만 변경 가능.
create policy "app_config_public_read" on app_config
  for select
  using (true);

-- iOS 시드 행. store_url은 앱 출시 후 실제 App Store 링크로, min_version은 강제할 때 올린다.
-- (min_version=1.0.0이면 1.0.0 이상 전부 통과 — 아직 아무도 강제되지 않음.)
insert into app_config (platform, min_version, latest_version, store_url)
values ('ios', '1.0.0', '1.0.0', 'https://apps.apple.com/app/id0000000000')
on conflict (platform) do nothing;
