set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0044_app_clients.sql
--
-- 사용자가 지금 쓰는 앱 버전과 플랫폼(ios·android)을 기록한다.
-- 앱이 로그인 상태가 될 때마다(앱 실행·로그인) report_app_client RPC를 부른다.
-- 계정 × 플랫폼마다 한 행 — 가장 최근에 본 버전만 남긴다(이력은 쌓지 않는다).
--
-- 읽기는 운영자만(SQL·service role). 앱에는 읽는 길을 주지 않는다 — 정책 없는 RLS.
--   select platform, app_version, count(*) from app_clients group by 1, 2 order by 1, 2;

create table if not exists public.app_clients (
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      text not null check (platform in ('ios', 'android')),
  app_version   text not null,          -- 사용자에게 보이는 버전(예: 2.0.0)
  build         text,                   -- 빌드 번호(iOS CFBundleVersion · Android versionCode)
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (user_id, platform)
);
comment on table public.app_clients is '계정 × 플랫폼별 최근 앱 버전(report_app_client가 갱신)';

alter table public.app_clients enable row level security;
alter table public.app_clients force row level security;

-- 앱이 보고한다. user_id는 auth.uid()로 강제. 값이 이상하면 거절한다(임의 문자열을 쌓지 않게).
create or replace function public.report_app_client(p_platform text, p_app_version text, p_build text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_platform is null or p_platform not in ('ios', 'android') then raise exception 'INVALID_PLATFORM'; end if;
  if p_app_version is null or p_app_version !~ '^[0-9A-Za-z.+_-]{1,32}$' then raise exception 'INVALID_VERSION'; end if;
  if p_build is not null and p_build !~ '^[0-9A-Za-z.+_-]{1,32}$' then raise exception 'INVALID_VERSION'; end if;

  insert into app_clients (user_id, platform, app_version, build)
  values (auth.uid(), p_platform, p_app_version, p_build)
  on conflict (user_id, platform) do update
    set app_version  = excluded.app_version,
        build        = excluded.build,
        last_seen_at = now();
end $$;

revoke all on function public.report_app_client(text, text, text) from public;
revoke all on function public.report_app_client(text, text, text) from anon;
grant execute on function public.report_app_client(text, text, text) to authenticated;
