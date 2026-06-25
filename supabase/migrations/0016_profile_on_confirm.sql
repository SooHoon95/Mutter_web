-- supabase/migrations/0016_profile_on_confirm.sql
--
-- profiles는 "코드 인증(이메일 확인) 완료" 후에만 생성한다.
--
-- 버그: signInWithOtp(shouldCreateUser:true)는 코드 "요청" 시점에 auth.users 행을
--   email_confirmed_at = NULL(미인증)로 즉시 생성한다. 기존 handle_new_user(0006)는
--   AFTER INSERT라 이때 곧바로 profiles 행을 만들어 → 코드를 한 번도 입력 안 한 사람도
--   회원(profiles)으로 잡혔다.
--
-- 수정:
--   1. handle_new_user를 재정의 — INSERT 시 email_confirmed_at이 이미 있는 경우(OAuth 등)에만 생성.
--   2. on_auth_user_confirmed 트리거 신설 — email_confirmed_at이 NULL→NOT NULL로 바뀌는
--      "코드 인증 순간"에 profiles 행 생성(닉네임=이메일 로컬파트).
--   3. 기존 미인증 orphan profiles 정리 — 인증 안 한 사용자의 profiles 행 삭제.
--      (이후 그 사용자가 코드 인증하면 #2 트리거가 다시 생성한다.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. handle_new_user 재정의 — INSERT 시점엔 "이미 확인된" 사용자만 생성
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 미인증(email_confirmed_at IS NULL)으로 들어온 행(OTP 코드 요청 등)은 아직 회원이 아니다.
  -- OAuth처럼 INSERT 시점에 이미 확인된 경우에만 프로필을 만든다.
  if new.email_confirmed_at is not null then
    insert into public.profiles (id, nickname)
    values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 코드 인증(확인) 순간에 프로필 생성
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function handle_user_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 기존 미인증 orphan profiles 정리
--    profiles 행 중, 대응하는 auth.users가 없거나 아직 미인증인 행을 삭제한다.
--    (인증 완료한 사용자의 프로필은 보존)
-- ─────────────────────────────────────────────────────────────────────────────
delete from public.profiles p
where not exists (
  select 1 from auth.users u
  where u.id = p.id
    and u.email_confirmed_at is not null
);
