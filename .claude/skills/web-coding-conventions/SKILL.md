---
name: web-coding-conventions
description: Use when creating new .ts/.tsx files, naming components/types/hooks, ordering imports, writing comments, or preparing commits. Trigger on "새 파일", "컴포넌트 작성", "네이밍", "타입", "hook", "주석", "커밋".
user-invocable: false
---

# 코딩 컨벤션 (TypeScript + React)

## 네이밍

- **컴포넌트:** PascalCase 파일·심볼 (`ComposeEditor.tsx` → `export function ComposeEditor`).
- **hook:** `use` 접두사 camelCase (`useAuth`, `useLetterDraft`).
- **순수 함수/유틸:** camelCase (`generateToken`, `validateScUrl`).
- **타입·인터페이스:** PascalCase, 접미사 없는 도메인 명사 (`Letter`, `MusicCue`). 유니온 enum-유사 타입은 리터럴 유니온 우선 (`type SourceType = 'soundcloud' | 'hosted'`).
- **상수:** UPPER_SNAKE (`TOKEN_BYTES = 16`, `LICENSE_WHITELIST`).
- **파일:** 컴포넌트 = PascalCase, 그 외(hook/util/타입) = camelCase 또는 kebab. 한 폴더 안에서 일관.

## TypeScript

- `strict: true`. `any` 금지 — 불가피하면 `unknown` + 좁히기. 외부 SDK 타입은 명시 선언.
- 함수 시그니처(공개 API)는 반환 타입 명시. 내부 지역 변수는 추론에 맡긴다.
- 도메인 모델은 `data/types.ts`에 한 곳. DB row 타입과 domain 타입을 분리하고 매퍼로 변환.
- 널 가능성은 옵셔널(`?`)·유니온으로 표현, `!` non-null 단언 지양.

## React

- 함수형 컴포넌트 + hook만. 클래스 컴포넌트 금지.
- 컴포넌트는 작게. 200줄 넘으면 분리 검토.
- 부수효과는 `useEffect`에 가두고 의존성 배열을 정확히. 정리(cleanup)가 필요한 구독(IntersectionObserver, Widget 이벤트)은 반드시 cleanup 반환.
- 리스트 `key`는 안정적 id(인덱스 금지, 단락 재정렬 때문).
- 접근성: 인터랙티브 요소는 시맨틱 태그(`button`), 수신 뷰는 스크린리더용 텍스트 레이어 필수(→ viewer).

## import 순서

1. 외부 라이브러리 (react, @tanstack/react-query, @supabase/supabase-js)
2. 내부 절대경로 (`@/lib`, `@/data`, `@/features`, `@/components`)
3. 상대경로 (`./`)
4. 타입 전용 import는 `import type`.

`@/`는 `src/`로 매핑(vite alias + tsconfig paths).

## 주석

- 기본은 **왜(why)**를 적는다. 무엇(what)은 코드로 드러낸다. 자명한 주석 금지.
- 비자명한 결정·제약(iOS 오디오 언락, SC embed 면책 경계, 토큰 엔트로피 근거)은 한 줄 주석으로 근거를 남긴다.
- 처음 도입하는 SDK/패턴은 `learning-comments` 스킬이 트리거되면 그 블록에 한해 풍부한 한국어 주석.
- 주석 처리된 dead code 커밋 금지.

## 포맷 / 린트

- Prettier(기본값) + ESLint(typescript-eslint 권장 룰). 커밋 전 `npm run lint` 통과.
- 세미콜론 사용, 2-space 들여쓰기, single quote.

## 자가 점검

- `any`·`!` 단언·인덱스 key가 새로 들어오지 않았는가.
- 공개 함수에 반환 타입이 있는가.
- 구독·타이머·이벤트 리스너에 cleanup이 있는가.
- 커밋에 `.env`·`node_modules`·dead code가 없는가.
