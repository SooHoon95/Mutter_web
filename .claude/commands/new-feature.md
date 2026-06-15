# new-feature

새 기능 모듈(라우트 + 컴포넌트 + hook)을 추가한다. (`pwa-architecture`·`web-coding-conventions` 스킬 참조)

## 작업 순서

1. **위치 결정:** `src/features/<name>/`. 순수 로직은 `src/lib/`, 데이터 접근은 `src/data/`로 내린다.
2. **구조 생성:**
   ```
   src/features/<name>/
   ├── components/      이 기능의 UI
   ├── hooks/           use<Name> 등 (react-query 호출, 로컬 상태)
   └── index.ts         공개 표면(외부는 이것만 import)
   ```
3. **라우트 연결:** 필요 시 `src/routes/`에 페이지 추가 + `src/app/` 라우터 등록. 제작(인증)/수신(무인증) 구분 확인.
4. **의존 방향 점검:** `feature → feature` 금지. 공유는 `lib`/`data`로.
5. **테스트:** 순수 로직은 `src/lib/*.test.ts`(vitest). UI/통합은 필요 범위만.
6. **검증:** `/build-web`(타입체크·테스트) → 동작 확인.

## 자가 점검
- 새 feature가 다른 feature를 직접 import하지 않는가.
- 검증·계산 로직이 `lib` 순수 함수로 분리돼 테스트가 있는가.
- 수신 경로라면 인증 의존이 없는가.
