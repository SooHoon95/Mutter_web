---
name: learning-comments
description: Use when introducing unfamiliar SDKs/APIs (SoundCloud Widget, Supabase, Web Audio, IntersectionObserver) into the codebase. Trigger on user phrases like "처음 써봐", "주석 달아줘", "흐름 따라가게", "이해 안 가", "공부 중", "학습용". Overrides the default "minimize comments" rule for THAT specific block.
user-invocable: false
---

# 학습용 주석 규칙

사용자는 Swift 개발자이고 서버/웹 인프라는 초보다. 처음 도입하는 외부 SDK/패턴(SoundCloud Widget API, Supabase, Web Audio, IntersectionObserver, service worker 등)에는 그 블록에 한해 **흐름을 따라갈 수 있는 풍부한 한국어 주석**을 단다.

## 언제

- 처음 도입하는 외부 SDK/API·웹 플랫폼 고급 API.
- 사용자가 "처음 써봐", "주석 달아줘", "흐름 따라가게", "이해 안 가", "공부 중", "학습용" 등으로 요청.

## 어떻게

- **무엇을 왜 하는지** 단계별로. 단순히 코드를 한국어로 옮기지 말고, *왜 이 호출이 필요한지*·*이 SDK가 무슨 일을 하는지*를 설명.
- 비자명한 제약(iOS 오디오 언락이 사용자 제스처 안에서만 되는 이유, SC embed 면책 경계, RLS가 클라이언트 신뢰 없이 막는 원리)을 짚는다.
- 블록 상단에 3~5줄 개요 주석 + 핵심 라인에 인라인 주석.

## 범위 한정 (중요)

- 이 규칙은 **해당 블록에만** 적용된다. 프로젝트 전반의 "주석 최소화"(`web-coding-conventions`) 기본을 뒤집지 않는다.
- 익숙한 표준 코드(일반 React·CRUD)는 평소대로 주석 최소.

## 자가 점검

- 학습 대상 블록에 흐름을 따라갈 수 있는 한국어 주석이 있는가.
- 그 외 코드는 여전히 주석 최소 원칙을 지키는가.
