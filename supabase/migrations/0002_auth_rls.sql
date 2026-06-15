-- supabase/migrations/0002_auth_rls.sql
--
-- T2 (US-002): 제작자 인증 + RLS
--
-- 테이블: letters, delivery_links
-- RLS: 소유자만 읽기/쓰기. anon에게 letters 직접 SELECT 열지 않음.
--
-- 수신 공개 조회는 토큰 기반 RPC get_letter_by_token(token, password?)에서 처리한다(T7).
-- anon이 letters를 직접 SELECT 하면 편지 내용이 노출될 수 있으므로 여기서는 열지 않는다.
-- delivery_links도 anon이 직접 읽으면 토큰 열거가 가능하므로 소유자 관리로 제한한다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. letters 테이블
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists letters (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  title        text not null default '',
  -- paragraphs: [{ id, text, musicCueId? }] — 싱크 엔진이 소비하는 단락 배열
  paragraphs   jsonb not null default '[]'::jsonb,
  template_id  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 소유자 조회 인덱스
create index if not exists letters_owner_id_idx on letters(owner_id);

-- updated_at 자동 갱신 트리거
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger letters_updated_at
  before update on letters
  for each row execute function update_updated_at();

-- RLS 활성 (+ FORCE: 테이블 소유자 롤도 RLS를 우회하지 못하게 — security definer 함수 방어)
alter table letters enable row level security;
alter table letters force row level security;

-- 소유자만 모든 연산(select/insert/update/delete) 허용
create policy "letters_owner_rw" on letters
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- anon SELECT 는 의도적으로 열지 않는다.
-- 수신 조회는 T7의 get_letter_by_token() RPC (security definer)를 통해서만 가능하다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. delivery_links 테이블
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists delivery_links (
  id             uuid primary key default gen_random_uuid(),
  letter_id      uuid not null references letters(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  -- token: >=128bit 추측불가 URL-safe 문자열 (T7 generateToken으로 생성)
  token          text not null unique,
  -- password_hash: argon2/bcrypt 해시. NULL이면 암호 없음
  password_hash  text,
  -- claim_device_id: 최초 열람 장치 ID (claim-and-bind, T8)
  claim_device_id text,
  claimed_at     timestamptz,
  expires_at     timestamptz,
  revoked        boolean not null default false,
  revoked_at     timestamptz,                        -- M-3: revoke 시각 (revoke_link RPC가 설정)
  created_at     timestamptz not null default now()
);

create index if not exists delivery_links_token_idx on delivery_links(token);
create index if not exists delivery_links_owner_id_idx on delivery_links(owner_id);

-- RLS 활성 (+ FORCE: 토큰 열거 방어 — 소유자 롤도 우회 불가)
alter table delivery_links enable row level security;
alter table delivery_links force row level security;

-- 소유자만 관리(생성·조회·수정·삭제)
create policy "delivery_links_owner_rw" on delivery_links
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- anon 직접 SELECT 금지: 토큰 열거를 막기 위해 delivery_links도 직접 열지 않는다.
-- 수신 조회는 T7의 get_letter_by_token() RPC (security definer)가 내부에서만 접근한다.
