-- supabase/migrations/0023_kakao_identity_map.sql
--
-- 카카오 로그인 신원 소유(백엔드 우선 설계).
--   기존: 웹은 Supabase 내장 카카오 OAuth(auth.identities, provider=kakao)를 사용.
--   전환: 카카오 회원을 우리가 직접 소유한다. Edge Function `kakao-login`이
--         카카오 회원번호(sub) → user_id 매핑을 이 표로 관리하고, 세션을 발급한다.
--   목적: GoTrue 내장 카카오 OAuth 내부 신원행에 의존하지 않으므로(사설 스키마 결합 0),
--         버전 업그레이드에도 안정적이고 웹/앱이 동일 경로로 같은 계정에 수렴한다.
--
--   R2: 카카오끼리는 같은 sub → 같은 user_id. 구글↔카카오는 이메일이 같아도 별도 계정
--       (신규 카카오 유저 생성 시 email UNIQUE 충돌 → Edge가 409 차단, 병합 금지).

-- ─────────────────────────────────────────────────────────────────────────────
-- kakao_identity_map: 카카오 회원번호(sub) ↔ Supabase user_id
--   - Edge Function이 service_role로만 읽고 쓴다(클라이언트 접근 불가).
--   - kakao_sub가 PK → 동시 최초 로그인 레이스의 멱등 게이트(중복 삽입 시 1건 수렴).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists kakao_identity_map (
  kakao_sub   text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- on delete cascade(user 삭제 시 매핑 정리) 성능용 인덱스.
create index if not exists kakao_identity_map_user_idx on kakao_identity_map(user_id);

-- RLS 켜고 정책 0개 → anon/authenticated는 전면 차단.
-- service_role은 BYPASSRLS라 Edge Function만 접근 가능(신원 매핑은 절대 클라에 노출 안 함).
alter table kakao_identity_map enable row level security;
alter table kakao_identity_map force row level security;

revoke all on table kakao_identity_map from anon, authenticated;
