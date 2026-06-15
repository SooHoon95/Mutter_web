# build-web

빌드·타입체크·테스트를 실행하고 에러를 분석한다. (`web-build-test` 스킬 참조)

## 작업 순서

1. **타입체크 먼저:** `npm run typecheck` — 가장 빠른 실패 신호.
2. **유닛 테스트:** `npm run test`. 긴 경우 `run_in_background`.
3. **빌드:** `npm run build`(tsc + vite). 콜드 번들 크기 확인(<3s/4G 예산).
4. 실패 시:
   - 에러 메시지의 **핵심만** 인용(전체 스택 반복 금지).
   - 근본 원인 진단 → 수정 → 재실행. 테스트를 지워서 통과시키지 않는다.
   - 타입 에러는 `any`로 덮지 말고 타입을 바로잡는다.
5. e2e가 필요하면 `npm run e2e`(playwright). 인코그니토 시나리오는 새 browser context.

## 자동 트리거
- 코드 수정 후 항상 1~2단계.
- 파일 구조·의존성 변경 후 3단계.
- TASK 완료 직전 전체 실행 후 `/verify-task`.
