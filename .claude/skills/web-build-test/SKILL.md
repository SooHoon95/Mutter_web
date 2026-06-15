---
name: web-build-test
description: Use when running the dev server/build (vite), unit tests (vitest), e2e (playwright), typecheck/lint, PWA manifest/SW, or troubleshooting Netlify deploy. Trigger on "빌드", "dev 서버", "vite", "vitest", "테스트", "playwright", "타입체크", "lint", "매니페스트", "서비스워커", "Netlify", "배포".
user-invocable: false
---

# 빌드 · 테스트 · 배포 규칙

## 명령어 (package.json scripts)

```bash
npm run dev          # vite dev 서버 (HMR)
npm run build        # tsc 타입체크 → vite 프로덕션 빌드 (dist/)
npm run preview      # 빌드 산출물 로컬 프리뷰
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest run (유닛/통합)
npm run test:watch   # vitest watch
npm run e2e          # playwright test
```

- 긴 작업(빌드·e2e·install)은 `run_in_background`로 실행하고 폴링.
- 코드 수정 후 최소 `npm run typecheck && npm run test`. 빌드 깨지면 즉시 근본 수정.

## PWA

- `vite-plugin-pwa`로 매니페스트 + 서비스워커 생성. `manifest`: name, short_name, icons(192/512/maskable), theme_color, display: standalone, start_url.
- SW 전략: 앱 셸 precache + 정적 에셋 캐시. 수신 편지 데이터는 network-first(최신성·revoke 반영).
- A2HS(홈 화면 추가) 동작: 매니페스트 유효 + HTTPS + SW 등록.
- **콜드 <3s/4G** 예산: 초기 번들 경량(코드 스플릿 라우트별), SC iframe·`<audio>`는 ▶ 이후 lazy-mount(façade).

## 테스트 전략

- **Unit(vitest):** `src/lib/*` 순수 함수 1순위 — 토큰 엔트로피(≥128bit), oEmbed 검증(주입 fetch), 라이선스 게이트(CC0 통과/NC·ND 거부), 큐 모델, expiry/revoke.
- **Integration(vitest + jsdom):** `TrackSource` 동형성(SC·호스팅 동일 인터페이스), 싱크 엔진(IntersectionObserver mock → seekTo 호출), claim-and-bind.
- **E2E(playwright):** happy(작성→큐→링크→인코그니토 오픈→스크롤 동기) + 불행(광고 경고, embed-disabled 거부, SC 삭제→폴백, revoked 링크). 인코그니토 = 새 browser context(스토리지 격리).

## 환경 변수

- `.env`(gitignore): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `.env.example`은 커밋.
- service role 등 비밀은 클라이언트 빌드에 절대 포함 금지.

## Netlify 배포

- `netlify.toml`: build command `npm run build`, publish `dist`, SPA 리다이렉트(`/* → /index.html 200`).
- 헤더: 수신 라우트 `X-Robots-Tag: noindex`. 보안 헤더(CSP는 SC iframe·Supabase 도메인 허용).
- 미리보기 배포로 실기기(iOS Safari·Android Chrome) 검증.

## 자가 점검

- `npm run build`(타입체크 포함)와 `npm run test`가 신선하게 통과하는가.
- 매니페스트·SW가 유효하고 A2HS가 동작하는가.
- `.env`/비밀이 번들·git에 들어가지 않았는가.
- 콜드로드가 예산(<3s/4G) 안인가(번들 크기·lazy-mount 확인).
