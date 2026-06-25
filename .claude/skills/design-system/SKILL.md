---
name: design-system
description: >-
  디자인 토큰(색/타이포/간격/라운드/그림자) 사용 규칙. 새 컴포넌트 CSS 작성,
  하드코딩 색 제거, 버튼/표면/보더 스타일링, 라이트 크롬 vs 시네마틱 수신 뷰 구분 시 로드.
---

# design-system

letter-app의 디자인 시스템은 **Untitled UI**(Tailwind v4 팔레트 + Inter, 메탈릭 골드 `#D4AF37`)
기반이다. 토큰 SSOT는 `src/styles/tokens.css`, 애플리케이션 베이스는 `src/styles/global.css`.

## 대원칙

1. **하드코딩 색 금지.** 컴포넌트 CSS는 hex/rgb 리터럴 대신 `var(--token)`만 쓴다.
   (예외: 외부 브랜드 로고 색 — Kakao `#fee500`, Google 4-color. 토큰화하지 않는다.)
2. **두 개의 아트디렉션을 구분한다.**
   - **제작자 크롬**(셸·홈·폼·버튼·리스트·연결·스레드·인박스·마이페이지) = **라이트** 디자인 시스템.
     `--bg-primary`(흰색) 표면 + `--text-*` + 브랜드 골드 액션.
   - **시네마틱 수신 뷰**(`features/viewer/*`, `routes/Viewer`)와 **편지지 템플릿**
     (`styles/themes.css`, `features/templates/TemplatePreview`, `Paginated`)는 **의도된 별도 아트**다.
     다크/웜 색을 라이트로 뒤집지 말 것. 여기서는 색은 그대로 두고 `--radius-*`/`--space-*`/`--shadow-*`
     스케일만 채택해도 된다.
3. **의미 토큰을 우선**한다. 원시 팔레트(`--gray-700`)보다 의미 토큰(`--text-secondary`)을 쓴다.
4. **주요 액션 = 브랜드 골드.** primary 버튼은 `background: var(--bg-brand); color: var(--text-on-brand);`.
   보조 액션은 중립(`--bg-tertiary` 채움 + `--text-secondary`) 또는 보더형.

## 토큰 빠른 참조 (전체는 tokens.css)

- **표면(bg):** `--bg-primary`(흰색) · `--bg-secondary`(gray-50) · `--bg-tertiary`(gray-100) ·
  `--bg-brand`(골드) · `--bg-brand-subtle`(연골드) · `--bg-overlay`(gray-900)
- **텍스트:** `--text-primary` · `--text-secondary` · `--text-tertiary` · `--text-quaternary` ·
  `--text-placeholder` · `--text-on-brand`(흰) · `--text-brand`(골드 700) · `--text-error` · `--text-success`
- **보더:** `--border-primary`(gray-300) · `--border-secondary`(gray-200) · `--border-brand` · `--border-error`
- **브랜드 스케일:** `--brand-50 … --brand-950` (primary `--brand-600` = #D4AF37)
- **시맨틱 스케일:** `--error-*` · `--warning-*` · `--success-*` · `--blue-*`
- **라운드:** `--radius-xs|sm|md|lg|xl|2xl|3xl|4xl|full`
- **간격(4px base):** `--space-1`(4) … `--space-8`(32) … `--space-24`(96)
- **그림자:** `--shadow-xs|sm|md|lg|xl|2xl` · `--shadow-focus-brand`(골드 포커스 링)
- **타이포:** `--font-sans`(Inter+한글폴백) · `--font-mono` · `--display-*-size/-lh/-tracking` ·
  `--text-xl|lg|md|sm|xs-size/-lh` · `--weight-regular|medium|semibold|bold`
- **타입 유틸 클래스:** `.uui-display-md`, `.uui-text-lg` … (직접 부착용)

## 마이그레이션 매핑 (관측된 하드코딩 → 토큰)

크롬 컴포넌트에서 기존 리터럴을 아래로 치환한다. **레이아웃/선택자/구조는 절대 바꾸지 말 것 —
색·라운드·간격·그림자 "값"만 토큰으로 교체.** 애매하면 가장 가까운 의미 토큰을 고르고 진행한다.

| 기존 리터럴 | 토큰 |
|---|---|
| `#fff` `#ffffff` (표면) | `var(--bg-primary)` |
| `#fcfaf5` `#faf8f3` `#fafafa` `#f9f9f9` `#f8f8f8` `#fdf8e6` `#f3f0ea` | `var(--bg-secondary)` |
| `#f5f5f5` `#f0f0f0` | `var(--bg-tertiary)` |
| `#ece8e0` `#e8e4da` `#e5e5e5` `#e0e0e0` `#e4e4e7` (보더) | `var(--border-secondary)` |
| `#ddd` `#d0d0d0` `#ccc` `#d4c9b8` `#aab3bf` (보더) | `var(--border-primary)` |
| `#bbb` `#a1a1aa` (희미한 텍스트) | `var(--text-quaternary)` |
| `#888` `#9a958c` `#8a7a5e` | `var(--text-tertiary)` |
| `#555` `#667085` | `var(--text-secondary)` |
| `#6b5d44` `#4a3c2e` | `var(--text-secondary)` |
| `#333` `#2a2a2a` `#2c2416` (본문 텍스트) | `var(--text-primary)` |
| `#1a1a1a` `#18181b` (주요 버튼 **배경**) | `var(--bg-brand)` + 글자 `var(--text-on-brand)` |
| `#1a1a1a` (텍스트) | `var(--text-primary)` |
| `#8b6914` `#a07800` `#6b4e0e` (골드-브라운 강조) | `var(--text-brand)` 또는 `var(--brand-700)` |
| `#e8c87a` `#f5e792` (연골드) | `var(--brand-200)` / `var(--brand-100)` |
| `#c8a24a` `#dab23a` (골드 액션) | `var(--brand-600)` |
| `#7c6fe0` (구 보라 액센트) | `var(--brand-600)` |
| `#b94040` `#f44336` `#c62828` `#c33` `#d92d20` (에러) | `var(--text-error)` / `var(--error-600)` |
| `#f87171` `#fda29b` | `var(--error-400)` / `var(--error-300)` |
| `#fff5f5` `#fff0f0` `#fef3f2` (에러 표면) | `var(--error-50)` |
| `#3a6b3a` `#2e7d32` `#079455` (성공) | `var(--success-700)` |
| `#f6fef9` `#ecfdf3` (성공 표면) | `var(--success-50)` |
| `rgba(255 255 255 / .03~.1)` (다크용 보더/필) | 라이트 크롬에선 `var(--border-secondary)` 보더 + `var(--bg-primary)` 필 |
| radius `4px`→`--radius-xs` `8px`→`--radius-md` `10px`→`--radius-lg` `12px`→`--radius-xl` `16px`→`--radius-2xl` `999px`→`--radius-full` | 대응 토큰 |

**브랜드 로고 색 유지:** `#fee500`(Kakao), Google 로고 4색(`#4285F4` 등)은 그대로 둔다.

## 자가 점검 (크롬 CSS 작성/수정 후)

- [ ] 새/수정 크롬 CSS에 hex 리터럴이 남았는가? (로고 예외 외 0이어야 함)
- [ ] 주요 액션 버튼이 브랜드 골드(`--bg-brand` + `--text-on-brand`)인가?
- [ ] 다크용 `rgba(255 255 255 / …)`가 라이트 표면에서 보이지 않게 남지 않았는가?
- [ ] 시네마틱 수신 뷰/편지지 템플릿의 의도된 색을 라이트로 훼손하지 않았는가?
