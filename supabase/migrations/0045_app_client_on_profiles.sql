set lock_timeout = '3s'; set statement_timeout = '30s';

-- supabase/migrations/0045_app_client_on_profiles.sql
--
-- 앱 버전·플랫폼을 profiles에서 바로 보이게 옮긴다(0044는 별도 표 app_clients에 두었다).
-- 사용자마다 한 줄 — 가장 최근에 쓴 플랫폼과 버전만 남는다(두 기기를 쓰면 마지막에 연 쪽).
-- 앱이 부르는 RPC(report_app_client)의 이름·인자는 그대로라 앱은 바꿀 것이 없다.
--
--   select app_platform, app_version, count(*) from profiles where app_version is not null group by 1, 2 order by 1, 2;

alter table public.profiles
  add column if not exists app_platform text check (app_platform in ('ios', 'android')),
  add column if not exists app_version  text,
  add column if not exists app_build    text,
  add column if not exists app_seen_at  timestamptz;
comment on column public.profiles.app_platform is '마지막으로 쓴 앱의 플랫폼(ios·android) — report_app_client가 갱신';
comment on column public.profiles.app_version  is '마지막으로 쓴 앱 버전(예: 2.0.0)';
comment on column public.profiles.app_build    is '마지막으로 쓴 앱의 빌드 번호(iOS CFBundleVersion · Android versionCode)';
comment on column public.profiles.app_seen_at  is '앱이 마지막으로 버전을 보고한 시각';

-- 0044에 쌓인 값을 옮긴다(사용자마다 가장 최근 것).
update public.profiles p
   set app_platform = c.platform, app_version = c.app_version, app_build = c.build, app_seen_at = c.last_seen_at
  from (select distinct on (user_id) * from public.app_clients order by user_id, last_seen_at desc) c
 where c.user_id = p.id;

create or replace function public.report_app_client(p_platform text, p_app_version text, p_build text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_platform is null or p_platform not in ('ios', 'android') then raise exception 'INVALID_PLATFORM'; end if;
  if p_app_version is null or p_app_version !~ '^[0-9A-Za-z.+_-]{1,32}$' then raise exception 'INVALID_VERSION'; end if;
  if p_build is not null and p_build !~ '^[0-9A-Za-z.+_-]{1,32}$' then raise exception 'INVALID_VERSION'; end if;

  -- 로그인한 사용자는 프로필 행이 있다(가입 확인 때 만들어진다). 없으면 조용히 넘어간다.
  update profiles
     set app_platform = p_platform, app_version = p_app_version, app_build = p_build, app_seen_at = now()
   where id = auth.uid();
end $$;

drop table public.app_clients;
