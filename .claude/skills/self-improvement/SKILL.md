---
name: self-improvement
description: Use when starting a non-trivial task, tracking progress, writing a work plan, or recording a correction. Trigger on "작업 계획", "todo.md", "lessons.md", "진행 추적", "교정 기록", "리뷰 섹션", "회고", "세션 시작".
user-invocable: false
---

# 자기 개선 & 작업 관리 워크플로

`tasks/todo.md`(현재 작업 계획)와 `tasks/lessons.md`(교정 패턴 누적)를 운영하는 단일 출처(SSOT).

## 세션 시작 시

`tasks/lessons.md`를 먼저 검토한다. 누적된 교훈은 이번 세션의 자기 규칙이다.

## 작업 관리 6단계 사이클

사소하지 않은 작업(3단계 이상 또는 아키텍처 결정)은 아래 사이클을 따른다.

1. **Plan First** — `tasks/todo.md`에 체크 가능한 항목으로 계획을 작성한다. TASK 단위면 `ralplan`으로 합의.
2. **Verify Plan** — 구현 시작 전 계획을 검토한다(중요 결정은 사용자 확인).
3. **Track Progress** — 항목을 완료할 때마다 체크 표시한다(+ TaskUpdate).
4. **Explain Changes** — 단계마다 상위 레벨 요약을 남긴다.
5. **Document Results** — `tasks/todo.md` 하단 리뷰 섹션에 변경 요약·검증 증거를 적는다.
6. **Capture Lessons** — 사용자 교정이 있었다면 `tasks/lessons.md`를 갱신한다.

## `tasks/todo.md` 포맷

- `## 현재 작업` — 작업 제목 + `- [ ]` 체크박스 항목.
- `## 리뷰` — 완료 후 변경 요약·결과·검증 증거.
- 새 작업 시작 시 이전 작업 내용은 정리하거나 리뷰만 남긴다.

## `tasks/lessons.md` 포맷

사용자 교정이 발생할 때마다 최신 항목을 위로 추가한다.

- `### YYYY-MM-DD — 한 줄 제목`
- `- 상황:` 무엇을 하다 무엇이 잘못됐는가
- `- 교정:` 사용자가 어떻게 바로잡았는가
- `- 규칙:` 같은 실수를 막기 위한 자기 규칙

## 교정 기록 규칙

- 교정은 "그때만 고치고 끝"이 아니다 — 재발 방지 규칙으로 일반화해 기록한다.
- 같은 실수가 반복되면 기존 교훈의 규칙을 더 강하게 갱신한다.
- 교훈은 추상적 다짐이 아니라 검증 가능한 행동 규칙으로 쓴다.

## 자가 점검

- 사소하지 않은 작업인데 `tasks/todo.md` 계획 없이 구현을 시작하지 않았는가.
- 완료 표시 전 동작을 증명했는가(`완료 전 검증` 원칙).
- 사용자 교정 후 `tasks/lessons.md`를 갱신했는가.
- 세션 시작 시 `tasks/lessons.md`를 검토했는가.
