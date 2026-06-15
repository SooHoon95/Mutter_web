# TODO — 작업 계획

> 운영 규칙은 `self-improvement` 스킬. 전체 로드맵은 `docs/specs/task-breakdown.md`, 상태는 `.omc/prd.json`.

## 현재 작업

**v1 전체 TASK 완료 (T0~T10).** 다음 단계는 "남은 작업"(사용자 인프라 셋업) 참조.

## 리뷰

### v1 빌드 완료 (2026-06-16) — 전체 10개 user story passes:true

| TASK | 내용 | 검증 증거 |
|---|---|---|
| T0 | 부트스트랩: 하네스(CLAUDE.md·스킬9·커맨드4) + Vite/React/TS PWA 스캐폴드 + 요구사항·TASK 문서 | typecheck 0 · build · test green |
| T1 (US-001) | PWA 셸: 매니페스트·SW·A2HS·아이콘, 제작/수신 라우트 분기 | manifest+sw 생성, 콜드 ~77KB gzip |
| T2 (US-002) | 제작자 인증: 매직링크 + RLS(FORCE) + 수신 무인증 | 인증 테스트, RLS SQL |
| T3 (US-005) | CC0 카탈로그 + 라이선스 게이트(CC0/PD/CC-BY 통과, NC/ND 거부) + 프로비넌스 | 게이트 27 테스트 |
| T4 (US-004) | 음악 동기화 엔진: TrackSource(SC+Hosted 동형) + SyncEngine(IO→seekTo) + fade + iOS 언락 | 엔진 테스트 |
| T5 (US-003) | 편지 작문 + 음악 큐: SC oEmbed 검증, CC0 무드 픽커, 단락별 큐, 광고 경고 | oEmbed 거부 테스트 |
| T6 (US-006) | 템플릿 7종 + 타이포 + 모바일 페이지네이션 | 템플릿 13 테스트 |
| T7 (US-007) | 전달 링크: ≥128bit 토큰, 암호 서버비교, claim-bind, revoke/expiry, noindex | 보안리뷰 H1·M1·M2·M3·L1·L3 수정 |
| T8 (US-008) | 수신 무설치 웹뷰: ▶언락, 스크롤 동기, SC실패→CC0 무음0 폴백, CC-BY 크레딧, 접근성 | viewer 테스트 + e2e |
| T9 (US-009) | 법적 안전장치: 공개 takedown 채널, 오디오 비활성화, SC no-rip 감사 | 감사 문서 + grep |
| T10 (US-010) | E2E(happy+불행 16개, chromium 통과) + 디바이스 체크리스트 | e2e 16/16 |

**최종 검증:** `npm run typecheck` 0 · `npm run test` 153/153 · `npm run build` 성공 · `npm run e2e`(android-chrome) 16/16.

**프로세스:** 각 TASK는 ralplan(계획)→ultrawork(서브에이전트 병렬 구현)→ralph(AC 검증). 보안 민감(T2/T3/T7)은 code-reviewer/security-reviewer 독립 패스. 발견 결함은 모두 수정 후 재검증.

### 남은 작업 (사용자 인프라 셋업 — infra 초보용 가이드 필요)

1. **Supabase 프로젝트 생성** → `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정.
2. `supabase/migrations/0001~0004_*.sql`을 Supabase SQL Editor 또는 `supabase db push`로 적용(순서대로).
3. **CC0 음원 실제 수급**: `src/data/catalog/tracks.json`의 시드는 메타데이터만 — 실제 CC0 오디오 파일(Pixabay 등)을 Storage/정적에셋에 올리고 url 연결.
4. **Netlify 배포**: 레포 연결 → 빌드 `npm run build`, publish `dist`(netlify.toml 이미 구성). env 변수 등록.
5. **실기기 검증**: `docs/specs/device-test-checklist.md`로 iOS Safari·Android Chrome 통과.
6. (선택) webkit e2e: `npx playwright install webkit` 후 ios-safari 프로젝트 실행.
