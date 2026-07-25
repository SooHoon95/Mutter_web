# 설계: `/download` 앱 설치 페이지

- **작성일:** 2026-07-25
- **상태:** 승인됨 (구현 계획 대기)
- **관련:** `src/routes/Landing.tsx`(디자인 토큰 재사용), `src/lib/appLinks.ts`(스토어 URL), `supabase/migrations/0032_app_config_android.sql`(카노니컬 Play URL)

## 1. 목적

QR·SNS·명함 등 외부 채널에서 유입되는 사용자를 위한 **독립 "앱 받기" 랜딩**. iOS/Android 스토어로 원탭 유도하고, 데스크톱 방문자는 QR로 폰에 넘긴다. 기존 `/landing`(제품 마케팅 커버)과 별개의, 설치 전환에만 집중한 얇은 페이지.

## 2. 스코프

### 포함
- 새 독립 라우트 `/download`.
- 기기 감지(iOS / Android / desktop)로 맞는 스토어 버튼 강조.
- 데스크톱에서 QR 코드(자체 내장 제너레이터, npm 의존 0).
- iOS + Android 버튼 **항상 활성**.

### 비포함 (YAGNI)
- 기존 `/landing`·`router` 다른 라우트 변경(진입 링크 추가 안 함 — 독립 페이지 결정).
- PWA "홈 화면에 추가" 프롬프트, deferred `beforeinstallprompt` 훅.
- 실제 앱 스크린샷 갤러리(에셋 부재 — 스타일 목업로 대체하지 않고 간결한 카피 중심).
- QR 로고 임베드·색상 커스터마이즈.

## 3. 설계 결정 (브레인스토밍 합의)

| # | 결정 | 근거 |
|---|---|---|
| Q1 | 독립 `/download` 페이지 (랜딩 섹션 X) | QR·공유에 링크 하나로 뿌리기 좋음 |
| Q2 | iOS + Android **둘 다 활성 버튼** | Android Play 곧 출시 예정 |
| Q3 | 스마트 감지 **+ 데스크톱 QR** | 폰 원탭, 데스크톱은 QR로 폰 이관 |
| Q4 | QR = **자체 내장(벤더링)** | $0·최소 번들·공급망 리스크 없음(CLAUDE.md 원칙) |

## 4. 아키텍처

의존 방향: `routes/Download` → `lib/appLinks`(URL) + `lib/device`(감지) + `components/QrCode`(+ `lib/qr` 인코더). 순수 프레젠테이션 라우트 — Supabase·세션 의존 없음(설치 진입점은 인프라 장애와 무관하게 즉시 렌더).

### 4.1 스토어 URL 소스 — `src/lib/appLinks.ts` 확장
다운로드 **전용** 상수 2개를 추가한다. 기존 `APP_STORE_URL`(null 가능, 핸드오프 게이팅용)과 **의미를 섞지 않는다**.

```ts
/** 다운로드 페이지 전용 — 항상 유효한 스토어 URL(env 우선, 없으면 카노니컬 폴백). */
export const IOS_DOWNLOAD_URL: string =
  (import.meta.env.VITE_IOS_APP_STORE_URL as string | undefined)?.trim() ||
  'https://apps.apple.com/app/id6790086549';

export const ANDROID_DOWNLOAD_URL: string =
  (import.meta.env.VITE_ANDROID_PLAY_STORE_URL as string | undefined)?.trim() ||
  'https://play.google.com/store/apps/details?id=com.efreedom.mutter';
```

- env 미설정 빌드에서도 버튼 2개가 항상 활성(Q2 보장).
- 카노니컬 폴백 값의 출처: iOS = `.env.example`의 App Store id, Android = `0032_app_config_android.sql`의 Play URL.
- `.env.example`에 `VITE_ANDROID_PLAY_STORE_URL` 한 줄 추가(문서화).

### 4.2 기기 감지 — `src/lib/device.ts` (신규)
```ts
export type MobileOS = 'ios' | 'android' | 'other';
/** UA 기반 모바일 OS 판별. iPadOS 13+ 데스크톱 UA는 터치+Mac으로 iOS 보정. */
export function getMobileOS(ua?: string): MobileOS;
```
- `ua` 인자 기본값 = `navigator.userAgent`(테스트 주입 가능하도록 순수 함수).
- 규칙: `/iphone|ipad|ipod/i` 또는 (`/Macintosh/` && `maxTouchPoints > 1`) → `ios`; `/android/i` → `android`; 그 외 → `other`.

### 4.3 QR 제너레이터 — `src/lib/qr/` (신규, 벤더링)
- MIT 라이선스 단일 파일 QR 인코더(Reed-Solomon 포함)를 `src/lib/qr/qrEncoder.ts`로 벤더링. 기본 채택: **Nayuki QR Code generator (TypeScript, MIT)** — 의존 0·단일 파일·매트릭스 출력. 동등한 다른 단일 파일 MIT 구현으로 대체 가능. 파일 상단에 출처 URL·라이선스 주석 필수.
- API: `encodeToMatrix(text: string, ecc?: 'L'|'M'|'Q'|'H'): boolean[][]` — 모듈(칸) 불리언 매트릭스만 반환. DOM/캔버스 의존 없음.
- `src/lib/qr/index.ts`가 이 내부 인코더를 감싼 얇은 공개 API로 재노출.

### 4.4 QR 컴포넌트 — `src/components/QrCode.tsx` (신규)
```tsx
interface QrCodeProps { value: string; size?: number; className?: string; }
```
- 매트릭스를 인라인 **SVG**(`<rect>` 배경 + 검은 모듈 `<path>`)로 렌더. `shape-rendering="crispEdges"`.
- 색: 모듈 = `currentColor`, 배경 = 흰색(QR 스캔 대비 확보 — 다크 배경 위 흰 카드에 얹음). `role="img"` + `aria-label`.
- 실패(빈 문자열 등) 시 아무것도 렌더 안 함(null).

### 4.5 라우트 — `src/routes/Download.tsx` + `Download.module.css` (신규)
- `router.tsx`: `const Download = lazy(() => import('@/routes/Download'));` + `{ path: '/download', element: withCreatorShell(<Download />) }`.
- `Landing.module.css`의 라이트 SaaS 토큰(색·간격·라운드·그림자)과 일관된 스타일. 신규 module.css로 격리.

## 5. 페이지 콘텐츠 & 레이아웃

```
┌──────────────────────────────────────┐
│  [Mutter 로고]  Mutter                │  ← AppShell 헤더(공유)
├──────────────────────────────────────┤
│  히어로                                │
│   ✦ 편지를, 앱에서 더 깊게            │
│   H1: 앱으로 받으면 더 좋아요          │
│   리드: 도착 알림 · 부드러운 재생…    │
│                                        │
│   [ Apple  App Store ]  ← 감지 시 주   │
│   [ ▶ Google Play    ]  ← 감지 시 보조 │
│                                        │
│   (데스크톱만) ┌─QR─┐ 폰 카메라로     │
│                └────┘ 스캔해 설치      │
├──────────────────────────────────────┤
│  왜 앱? 3불릿 스트립                    │
│   🔔 편지 도착 푸시                    │
│   🎵 더 부드러운 음악 재생            │
│   🏠 홈 화면에서 바로                  │
├──────────────────────────────────────┤
│  앱 없이 웹으로 계속 →  (/)           │  ← 정직한 보조 탈출구
└──────────────────────────────────────┘
```

### 감지별 버튼 순서/강조
| OS | 주 CTA(크게) | 보조 | QR |
|---|---|---|---|
| ios | App Store | Google Play | ✕ |
| android | Google Play | App Store | ✕ |
| other(desktop) | 둘 다 동등 | — | ✓ (`origin + '/download'`) |

### 스토어 버튼
- 커스텀 버튼: 인라인 SVG(Apple 로고 / Google Play 삼각형) + "App Store에서 받기" / "Google Play에서 받기" 2줄 라벨. 공식 배지 PNG로 후일 교체 가능(주석 명시).
- `<a href>` + `target/rel` 없이 동일 탭 이동(스토어 딥링크는 OS가 앱으로 가로챔).

## 6. 접근성·성능
- reduced-motion 존중(리빌 애니메이션 쓸 경우 `Landing`과 동일 패턴). 스토어 버튼은 명확한 포커스 링·≥44px 터치 타깃.
- 코드 스플릿 라우트(lazy). QR 인코더는 데스크톱에서만 실질 사용되나 번들엔 포함 — 매우 작음(단일 파일). 콜드 번들 예산 영향 미미.
- QR 대비: 흰 배경 강제로 스캔 신뢰성 확보.

## 7. 테스트 (vitest + RTL, `ConnectHandoff.test.tsx` 패턴)
- `device.test.ts`: `getMobileOS` UA 매트릭스(iPhone/iPad13+/Android/Windows/Mac) → 기대 OS.
- `qr/qrEncoder.test.ts`: 알려진 문자열 → 매트릭스 크기·유한성(모듈 개수 > 0, 정사각) 스모크.
- `Download.test.tsx`:
  - iOS UA → App Store가 주 CTA(순서/강조), QR 미노출.
  - Android UA → Play 주 CTA, QR 미노출.
  - Desktop UA → 두 버튼 + QR(`<svg role="img">`) 노출.
  - 두 스토어 링크의 href가 `IOS_DOWNLOAD_URL`/`ANDROID_DOWNLOAD_URL`과 일치.

## 8. 수용 기준 (AC)
1. `/download` 진입 시 iOS/Android 버튼이 **항상** 렌더된다(env 미설정에도).
2. iPhone/Android UA에서 맞는 스토어가 주 CTA로 강조되고 QR은 숨는다.
3. 데스크톱 UA에서 두 버튼이 동등 노출되고 `/download`를 인코딩한 QR SVG가 보인다.
4. 스토어 href가 카노니컬(또는 env override) URL과 정확히 일치한다.
5. "웹으로 계속" 링크가 `/`로 간다.
6. npm 신규 의존성 0. `npm run typecheck && npm run test` 그린.

## 9. 변경/신규 파일
| 파일 | 종류 | 내용 |
|---|---|---|
| `src/lib/appLinks.ts` | 수정 | `IOS_DOWNLOAD_URL`·`ANDROID_DOWNLOAD_URL` 추가 |
| `src/lib/device.ts` | 신규 | `getMobileOS` |
| `src/lib/device.test.ts` | 신규 | UA 매트릭스 |
| `src/lib/qr/qrEncoder.ts` | 신규 | 벤더링 MIT QR 인코더 |
| `src/lib/qr/index.ts` | 신규 | 공개 래퍼 |
| `src/lib/qr/qrEncoder.test.ts` | 신규 | 인코더 스모크 |
| `src/components/QrCode.tsx` | 신규 | SVG QR 컴포넌트 |
| `src/routes/Download.tsx` | 신규 | 페이지 |
| `src/routes/Download.module.css` | 신규 | 스타일 |
| `src/routes/Download.test.tsx` | 신규 | 렌더 테스트 |
| `src/app/router.tsx` | 수정 | 라우트 등록 2줄 |
| `.env.example` | 수정 | `VITE_ANDROID_PLAY_STORE_URL` 문서화 |
