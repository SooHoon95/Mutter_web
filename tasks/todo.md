# TODO — 작업 계획

> 사소하지 않은 작업(3단계 이상 또는 아키텍처 결정)을 시작할 때 이 파일에 체크 가능한 계획을 작성한다.
> 운영 규칙(작성·추적·리뷰 사이클)은 `self-improvement` 스킬을 참조한다.
> 전체 TASK 로드맵은 `docs/specs/task-breakdown.md`, 상태 추적은 `.omc/prd.json` + Task 도구.

## 현재 작업

### T0: 프로젝트 부트스트랩 (하네스 + 스캐폴드)

- [x] CLAUDE.md 작성 (TheReader 하네스 모방)
- [x] 스킬 9종 작성 (.claude/skills/)
- [x] 슬래시 커맨드 4종 작성 (.claude/commands/)
- [x] tasks/todo.md · lessons.md 생성
- [x] 권한 설정 (.claude/settings.local.json)
- [x] 요구사항 명세서 (docs/specs/requirements.md)
- [x] TASK 분할 기획서 (docs/specs/task-breakdown.md)
- [x] .omc/prd.json 정제 (stack·harness 추가, task-specific AC 확인)
- [x] Vite + React + TS PWA 스캐폴드
- [x] Supabase 클라이언트 + Vitest + Playwright 셋업
- [x] typecheck + test + build 통과 (베이스라인 검증)

## 리뷰

### T0 완료 (2026-06-16)
- **하네스:** CLAUDE.md(TheReader 구조 모방) + 스킬 9종 + 커맨드 4종 + tasks/{todo,lessons}.md.
- **문서:** requirements.md(FR-1~10, NFR, 데이터모델), task-breakdown.md(의존 그래프·빌드순서·DoD), prd.json(stack 추가).
- **스캐폴드:** Vite+React+TS, react-router(코드 스플릿 7라우트), react-query, Supabase 클라이언트(lazy·anon only), 도메인 타입, lib/token(≥128bit)+테스트.
- **검증 증거:** `npm run typecheck` 0 에러 · `npm run test` 6/6 통과 · `npm run build` 성공(90 모듈, 메인 gzip 76KB, 라우트별 청크 분리).
- **이슈/해결:** 초기 typecheck 4건(import.meta.env, node:url, process) → @types/node 설치 + vite-env.d.ts + tsconfig.node types:["node"]로 해결.
- **미해결:** settings.local.json 권한 파일 자동쓰기 분류기 차단(세션 권한으로 작업 진행 가능, 영향 없음).
