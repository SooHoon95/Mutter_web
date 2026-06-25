-- supabase/migrations/0021_no_nickname_autoseed.sql
--
-- 닉네임 자동 시드 제거.
--
-- 버그: 가입 트리거(handle_new_user/handle_user_confirmed, 0006·0016)가 nickname을
--   이메일 로컬파트로 자동으로 채워 넣었다. 그 결과
--     1) /set-nickname 게이트가 "이미 이름 있음"으로 판정 → 화면을 건너뛰고 바로 홈으로,
--     2) 그 자동값("dkehskeh" 등)이 연결·발송·스레드에서 상대에게 그대로 노출.
--
-- 수정: 프로필 행은 만들되 nickname은 항상 NULL로 둔다. 닉네임은 오직 사용자가
--   /set-nickname에서 직접 입력해 upsert(upsertNickname)로만 기록한다
--   = "닉네임은 내려오든 말든 무조건 유저한테 받아서 박는다".

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 신규 가입(OAuth 등 INSERT 시점에 이미 email_confirmed): 행만 생성, nickname NULL.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null then
    insert into public.profiles (id, nickname)
    values (new.id, null)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) 이메일 코드 인증(email_confirmed_at NULL→NOT NULL) 순간: 행만 생성, nickname NULL.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, null)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 기존에 자동 시드된 닉네임 정리.
--    런칭 전 테스트 계정뿐이므로, 자동으로 박힌 모든 nickname을 NULL로 되돌린다.
--    → 기존 계정도 다음 로그인 시 전원 /set-nickname을 거쳐 직접 이름을 정하게 된다.
--    (사용자가 직접 정한 이름이라도 한 번 다시 입력하면 그대로 복구됨)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  update public.profiles set nickname = null where nickname is not null;
  get diagnostics n = row_count;
  raise notice '[0021] cleared % auto-seeded nickname(s)', n;
end $$;
