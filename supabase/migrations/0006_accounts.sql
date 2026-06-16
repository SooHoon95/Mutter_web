-- supabase/migrations/0006_accounts.sql
--
-- 계정 기반 기능: 프로필(마이페이지) + 받은 편지함(inbox).
--   - profiles: auth.users 1:1, 닉네임 등. 신규 가입 시 자동 생성 + 기존 사용자 백필.
--   - inbox: 수신자가 로그인 상태로 받은 편지를 계정에 보관(무계정 열람은 그대로 유지).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. profiles
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table profiles enable row level security;
alter table profiles force row level security;

-- 본인 프로필만 읽기/쓰기.
create policy "profiles_self_rw" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- updated_at 자동 갱신(update_updated_at 함수는 0002에서 정의됨).
drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- 신규 가입 시 프로필 자동 생성(닉네임 기본 = 이메일 로컬파트).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 기존 사용자 백필.
insert into public.profiles (id, nickname)
select id, nullif(split_part(coalesce(email, ''), '@', 1), '')
from auth.users
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. inbox (받은 편지함)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists inbox (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  letter_id uuid not null references letters(id) on delete cascade,
  token     text not null,           -- 보관 시 사용한 전달 토큰(재열람은 /l/:token)
  saved_at  timestamptz not null default now(),
  unique (user_id, letter_id)
);

alter table inbox enable row level security;
alter table inbox force row level security;

create policy "inbox_self_rw" on inbox
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists inbox_user_idx on inbox(user_id);

-- 받은 편지를 보관함에 저장(로그인 필요). 토큰 유효성 검증 후 insert/갱신.
create or replace function save_to_inbox(p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_link delivery_links;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_link from delivery_links where token = p_token;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;
  if v_link.revoked then raise exception 'LINK_REVOKED'; end if;

  insert into inbox (user_id, letter_id, token)
  values (auth.uid(), v_link.letter_id, p_token)
  on conflict (user_id, letter_id)
    do update set token = excluded.token, saved_at = now();
end;
$$;
revoke all on function save_to_inbox(text) from public;
grant execute on function save_to_inbox(text) to authenticated;

-- 내 보관함 목록(편지 제목 + 토큰 + 저장시각). 재열람은 /l/:token.
create or replace function get_my_inbox()
returns table (letter_id uuid, token text, title text, saved_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
    select i.letter_id, i.token, l.title, i.saved_at
    from inbox i
    join letters l on l.id = i.letter_id
    where i.user_id = auth.uid()
    order by i.saved_at desc;
end;
$$;
revoke all on function get_my_inbox() from public;
grant execute on function get_my_inbox() to authenticated;
