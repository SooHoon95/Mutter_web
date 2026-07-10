-- supabase/migrations/0028_push_tokens.sql
--
-- 푸시 알림용 FCM 등록 토큰 저장. 유저당 여러 기기(N개) 허용.
-- - 저장: 클라이언트가 로그인 상태에서 upsert_push_token RPC 호출(user_id=auth.uid 강제).
-- - 발송: send-push Edge Function이 service role로 수신자 토큰을 조회(RLS 우회)해 FCM에 보냄.
-- - 정리: FCM가 UNREGISTERED/무효 반환 시 Edge Function이 해당 토큰 행을 삭제(위생).

create table if not exists push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null unique,          -- FCM 등록 토큰(기기당 1개)
  platform   text not null default 'ios',   -- 'ios' | 'web' | 'android'
  device_id  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on push_tokens(user_id);

alter table push_tokens enable row level security;
alter table push_tokens force row level security;

-- 본인 토큰만 직접 접근(조회/삭제). 발송용 읽기는 service role(BYPASSRLS)로 Edge Function이 수행.
create policy "push_tokens_self" on push_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 토큰 등록/갱신. 같은 토큰이 다른 계정에서 재등록되면 소유자 이전(공용기기 대응).
create or replace function upsert_push_token(p_token text, p_platform text, p_device_id text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_token is null or length(p_token) = 0 then raise exception 'TOKEN_REQUIRED'; end if;

  insert into push_tokens (user_id, token, platform, device_id)
  values (auth.uid(), p_token, coalesce(p_platform, 'ios'), p_device_id)
  on conflict (token) do update
    set user_id   = auth.uid(),
        platform  = excluded.platform,
        device_id = excluded.device_id,
        updated_at = now();
end $$;

revoke all on function upsert_push_token(text, text, text) from public;
grant execute on function upsert_push_token(text, text, text) to authenticated;
