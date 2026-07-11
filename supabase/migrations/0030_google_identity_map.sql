-- supabase/migrations/0030_google_identity_map.sql
--
-- 구글 로그인 신원 소유(provider별 계정 분리). 0023 kakao_identity_map과 동형.
--   Edge Function `google-login`이 구글 회원번호(sub) → user_id 매핑을 이 표로 관리하고 세션을 발급한다.
--   목적: 네이티브 Supabase 구글 OAuth(auth.identities, provider=google)의 "같은 이메일 자동 링크"에서
--         벗어나, 구글 계정을 email·kakao와 별도 계정으로 유지한다(데이터 분리).
--
--   구글끼리는 같은 sub → 같은 user_id(웹↔앱 통합). 다른 provider와 이메일이 같아도 별도 계정.
--   (auth 이메일은 sub 기반 synthetic 값을 써 email UNIQUE 충돌·자동링크를 회피 — Edge가 처리.)

-- ─────────────────────────────────────────────────────────────────────────────
-- google_identity_map: 구글 회원번호(sub) ↔ Supabase user_id
--   - Edge Function이 service_role로만 읽고 쓴다(클라이언트 접근 불가).
--   - google_sub가 PK → 동시 최초 로그인 레이스의 멱등 게이트.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists google_identity_map (
  google_sub  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists google_identity_map_user_idx on google_identity_map(user_id);

-- RLS 켜고 정책 0개 → anon/authenticated 전면 차단. service_role(BYPASSRLS)만 접근.
alter table google_identity_map enable row level security;
alter table google_identity_map force row level security;

revoke all on table google_identity_map from anon, authenticated;
