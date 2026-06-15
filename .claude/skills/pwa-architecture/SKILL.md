---
name: pwa-architecture
description: Use when adding routes/feature modules, deciding folder/layer structure, splitting creator vs recipient routes, designing state/data flow, or checking dependency direction. Trigger on "새 라우트", "기능 모듈", "폴더 구조", "제작/수신 라우트", "상태 관리", "데이터 흐름", "의존 방향".
user-invocable: false
---

# PWA 아키텍처 규칙

letter-app은 **단일 코드베이스 PWA**가 두 개의 본질적으로 다른 경험을 라우트로 분기한다: **제작자(인증 필요)** vs **수신자(무인증·무마찰)**.

## 라우트 구조

```
/                 랜딩 (제품 소개 → 로그인 또는 편지 작성)
/login            매직링크 로그인
/create           편지 작성 + 단락별 음악 큐 연출   [인증 필요]
/create/:id       기존 초안 편집                    [인증 필요·소유자만]
/sent             내가 보낸 편지 목록               [인증 필요]
/l/:token         수신자 무설치 웹뷰                [무인증 — 토큰/암호/claim-and-bind로 통제]
/legal/takedown   권리주장자 신고 채널 (공개)
```

수신 라우트(`/l/:token`)는 **인증 코드 경로에 절대 의존하지 않는다**. 인코그니토·무계정에서 동작해야 한다.

## 폴더 구조 (feature-first + 얇은 레이어)

```
src/
├── app/              앱 진입점, 라우터, 전역 provider(QueryClient, AuthProvider)
├── routes/           라우트별 페이지 컴포넌트 (위 라우트와 1:1)
├── features/         도메인 기능 단위 (UI + hook + 로컬 상태)
│   ├── auth/         로그인, 세션, useAuth
│   ├── compose/      편지 작성, 단락 큐 에디터
│   ├── music/        TrackSource, SoundCloudSource, HostedAudioSource, 싱크 엔진  → music-sync 스킬
│   ├── catalog/      CC0 무드 픽커 UI                                            → license-compliance 스킬
│   ├── delivery/     링크 발급, 암호, claim-and-bind                              → capability-links 스킬
│   └── viewer/       수신자 웹뷰, 스크롤 동기 재생
├── lib/              순수 유틸 (토큰 생성, oEmbed 검증, 라이선스 게이트, 포맷터) — UI 비의존, 테스트 1순위
├── data/             Supabase 클라이언트, 쿼리/뮤테이션, 타입(DB row → domain)  → supabase-data 스킬
├── components/       공통 UI (Button, Sheet, Toast, AudioUnlockGate)
└── styles/           전역 토큰(색·타이포·간격), 템플릿 테마
```

## 의존 방향

```
routes → features → (lib, data, components)
features → 다른 feature 직접 import 금지. 공유가 필요하면 lib 또는 data로 내린다.
lib → 순수 함수만. React·Supabase·DOM 비의존(테스트 용이). (DOM 필요한 건 features에).
data → Supabase만 안다. UI 비의존. DB row를 domain 타입으로 매핑해 반환.
components → 도메인 비의존. props로만 동작.
```

금지: `feature → feature`, `lib → react/supabase`, `components → features/data`.

## 상태 관리

- **서버 상태:** `@tanstack/react-query` — 편지 CRUD, 카탈로그, 링크. 캐시·로딩·에러 일원화.
- **인증 상태:** `AuthProvider`(Context) + Supabase `onAuthStateChange`. → supabase-data 스킬.
- **로컬 UI 상태:** 컴포넌트 `useState`/`useReducer`. 전역 클라이언트 상태 라이브러리는 도입하지 않는다(범위 통제).
- **재생 상태:** 싱크 엔진이 소유(`music-sync`). React에는 최소 표면(현재 단락, 재생/일시정지)만 노출.

## 데이터 흐름

```
View → feature hook → data 쿼리/뮤테이션 → Supabase → DB row → domain 매핑 → View
                    ↘ lib 순수함수(검증·토큰·라이선스 게이트)
```

- View는 비즈니스 로직을 직접 들지 않는다. feature hook 또는 lib 함수를 호출한다.
- 검증·게이트(oEmbed, 라이선스, 토큰 엔트로피)는 **lib의 순수 함수**로 구현해 단위 테스트로 못 박는다.

## 도메인 타입 (핵심)

```
Letter        id, ownerId, title, paragraphs: Paragraph[], templateId, createdAt, updatedAt
Paragraph     id, order, text, cue?: MusicCue
MusicCue      sourceType: 'soundcloud' | 'hosted', ref(트랙 URL 또는 카탈로그 trackId), startMs?
Track         id, source, title, author, license, provenance      → license-compliance
DeliveryLink  token, letterId, hasPassword, claimedDeviceId?, expiresAt?, revokedAt?  → capability-links
```

## 자가 점검

- 수신 라우트(`/l/:token`)가 인증 코드 경로에 의존하지 않는가(인코그니토 동작).
- `feature → feature` 직접 import가 없는가.
- 검증·토큰·라이선스 게이트가 `lib` 순수 함수로 분리돼 단위 테스트가 있는가.
- DB row가 `data` 레이어 밖으로 그대로 새지 않는가(domain 매핑).
