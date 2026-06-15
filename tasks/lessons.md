# LESSONS — 교정 패턴 누적

> 사용자 교정이 발생할 때마다 최신 항목을 위로 추가한다. (운영 규칙은 `self-improvement` 스킬)
> 형식: `### YYYY-MM-DD — 한 줄 제목` / `- 상황:` / `- 교정:` / `- 규칙:`

### 2026-06-16 — 테스트의 Supabase mock 캐스팅은 `as unknown as`
- 상황: 서브에이전트가 부분 mock을 `client as ReturnType<typeof getSupabase>`처럼 직접 캐스팅 → `npm run test`(vitest, 타입 무시)는 통과하나 `npm run typecheck`/`build`(tsc -b)가 TS2352로 RED. T2·T5에서 반복 발생.
- 교정: 부분 mock은 `as unknown as ReturnType<typeof getSupabase>`로 캐스팅.
- 규칙: (1) 검증은 항상 `tsc -b`(typecheck/build)까지 포함한다 — vitest 통과만으로 완료로 보지 않는다. (2) 서브에이전트 위임 시 "src 하위 테스트도 tsc -b 검사 대상이므로 부분 mock은 `as unknown as`로 캐스팅"을 스펙에 명시한다.

### 2026-06-16 — 프로젝트 스코프: Notion v2가 아니라 로컬 PRD v4
- 상황: Notion "손글씨 PRD v2"는 손글씨 합성이 v1 핵심이지만, 로컬 `docs/PRD.md`는 v4로 진화해 손글씨를 v2로 연기하고 v1=스크롤 동기 음악 편지로 리프레임됨.
- 교정: 사용자가 v4(음악 편지 PWA)를 v1 빌드 대상으로 확정.
- 규칙: 제품 결정의 SSOT는 항상 로컬 `docs/PRD.md`(최신 버전) + `.omc/prd.json`. Notion은 히스토리 참고용. 외부 문서와 로컬 PRD가 충돌하면 로컬 최신본을 따르고 사용자에게 확인한다.
