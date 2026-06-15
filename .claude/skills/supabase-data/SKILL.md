---
name: supabase-data
description: Use when using the Supabase client, magic-link auth/session, tables/migrations, RLS policies (cross-account 403), Storage (CC0 audio), or Edge Functions. Trigger on "Supabase", "매직링크", "세션", "RLS", "마이그레이션", "테이블", "Storage", "Edge Function".
user-invocable: false
---

# Supabase 데이터 레이어 규칙

Supabase = 인증(매직링크) + Postgres(편지·링크·트랙) + RLS(접근 제어) + Storage(CC0 오디오). 모든 Supabase 접근은 `src/data/`에 가둔다.

## 클라이언트

- `src/data/supabase.ts`에서 단일 클라이언트 생성. `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **anon key만 클라이언트에.** service role key는 클라이언트 번들에 절대 금지 — 서버사이드(Edge Function)에서만.
- 쿼리/뮤테이션은 `src/data/<entity>.ts`에 함수로. 컴포넌트는 react-query hook으로 호출.

## 인증 (매직링크)

- `signInWithOtp({ email })` → 이메일 매직링크. 비밀번호 없음(마찰·유출 표면 최소).
- 세션은 Supabase가 localStorage에 지속. `onAuthStateChange`로 `AuthProvider` 갱신.
- `/create`·`/sent`는 세션 필수. 없으면 `/login` 리다이렉트.
- **수신 라우트(`/l/:token`)는 인증을 요구하지 않는다.** anon으로 토큰 기반 조회만.

## RLS (행 수준 보안) — 타계정 403의 핵심

모든 테이블 RLS 활성. 정책으로 소유권을 강제한다(클라이언트 신뢰 금지).

```sql
-- letters: 소유자만 읽기/쓰기
alter table letters enable row level security;
create policy "owner_rw" on letters
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

- 타계정 letter 접근은 RLS가 빈 결과/거부로 막는다 → 앱은 이를 404/403으로 표면화.
- 수신용 공개 조회는 **토큰으로만** 가능해야 한다 → letters를 직접 anon에 열지 말고, `delivery_links` + RPC/Edge Function 경유(아래).

## 수신 조회 패턴 (무인증 + 토큰)

- anon이 letters를 통째로 못 읽게 한다. 대신 보안 함수(`security definer` RPC 또는 Edge Function) `get_letter_by_token(token, password?)`:
  1. 토큰으로 `delivery_links` 조회 → revoked/expired 체크.
  2. 암호 ON이면 해시 비교(서버에서).
  3. claim-and-bind: 첫 claim 시 device id 바인딩, 이후 다른 device 거부.
  4. 통과 시 편지 + 트랙 메타 반환. **편지 본문은 절대 anon SELECT로 직접 노출하지 않는다.**
- 토큰 비교·암호 해시·바인딩 로직 상세는 `capability-links` 스킬.

## 마이그레이션

- SQL 마이그레이션은 `supabase/migrations/*.sql`로 버전 관리. 스키마 변경은 항상 마이그레이션 파일로(수동 콘솔 변경 지양).
- 핵심 테이블: `letters`, `paragraphs`(또는 letters.paragraphs jsonb), `delivery_links`, `tracks`(CC0 카탈로그 + 프로비넌스), `takedowns`.
- 로컬 검증은 supabase CLI(`supabase db reset`) 권장이나, 미설치 시 마이그레이션 SQL을 리뷰로 검증하고 원격 적용.

## Storage (CC0 오디오)

- CC0/RF 트랙은 Storage 버킷(public read) 또는 정적 에셋. `HostedAudioSource`가 그 URL로 `<audio>` 재생.
- 업로드(작성자) 버킷은 v1에서 만들지 않는다(v2, 면책 기계장치 선행).

## 자가 점검

- service role key가 클라이언트 번들/`.env`(VITE_)에 없는가.
- 모든 테이블 RLS 활성 + 소유권 정책이 있는가.
- 수신 조회가 letters 직접 anon SELECT가 아니라 토큰 게이트(RPC/Edge Function) 경유인가.
- 스키마 변경이 `supabase/migrations/`에 파일로 남았는가.
