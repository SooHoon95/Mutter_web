# TASK 분할 기획서 — letter-app v1

> PRD v4(`docs/PRD.md`) + 요구사항 명세서(`requirements.md`)를 **실행 가능한 TASK**로 분할한다.
> 실행 방식: 각 TASK는 `ralplan`(계획 합의) → `ultrawork`(서브에이전트 병렬 구현) → `ralph`(AC 검증). 모든 TASK 완료까지 멈추지 않는다.
> 상태 추적: `.omc/prd.json`(passes 플래그) + Task 도구.

## 빌드 순서 / 의존 그래프

PRD build_order = "HostedAudioSource + CC0 카탈로그로 싱크 엔진 먼저 디리스크 → SoundCloudSource → (v2)업로드". 이를 반영한 순서:

```
T0 부트스트랩 (하네스 + 스캐폴드)
   └─ T1 PWA 셸 (US-001)
        ├─ T2 제작자 인증 (US-002)            [Supabase 의존]
        ├─ T3 CC0 카탈로그 + 라이선스 게이트 (US-005)   [싱크 디리스크 1순위]
        │     └─ T4 음악 동기화 엔진 (US-004)   [HostedAudioSource 먼저, 그 위 SoundCloudSource]
        │           └─ T5 편지 작문 + 음악 큐 (US-003)  [T2, T4 의존]
        │                 └─ T6 템플릿 / 타이포 (US-006)
        ├─ T7 전달 링크 + 프라이버시 (US-007)   [T2 의존]
        │     └─ T8 수신자 웹뷰 (US-008)        [T4, T5, T7 의존 — 통합 지점]
        └─ T9 법적 안전장치 (US-009)            [T3, T8 의존]
                                  └─ T10 E2E + 디바이스 검증 (US-010)  [전체 통합 후]
```

권장 실행 레인:
1. **기반:** T0 → T1
2. **병렬 가능:** T2(인증) · T3(카탈로그) — 서로 독립
3. **음악 코어:** T4 (T3 위)
4. **작성 경험:** T5 → T6 (T2·T4 위)
5. **전달/수신:** T7 → T8 (통합 지점)
6. **안전/검증:** T9 → T10

## TASK 정의

각 TASK의 상세 AC는 `.omc/prd.json`의 동명 user story에 있다. 여기서는 범위·산출물·검증·의존을 요약한다.

### T0 — 프로젝트 부트스트랩
- **범위:** TheReader 하네스 모방(CLAUDE.md·skills·commands·tasks). Vite+React+TS PWA 스캐폴드, Supabase 클라이언트, Vitest+Playwright. 요구사항 명세서·TASK 기획서·prd.json 정제.
- **산출물:** 빌드되는 빈 앱 셸 + 테스트 통과 베이스라인.
- **검증:** `npm run typecheck && npm run test && npm run build` 통과. 더미 lib 테스트 1개 green.
- **의존:** 없음.

### T1 — PWA 셸 / 단일 코드베이스 (US-001)
- **범위:** vite-plugin-pwa 매니페스트·SW·A2HS. 라우터(제작/수신 분기). 코드 스플릿·오디오 lazy-mount로 콜드 예산.
- **산출물:** 라우트 골격(`/`, `/login`, `/create`, `/sent`, `/l/:token`, `/legal/takedown`), 설치형 PWA.
- **검증:** 매니페스트 유효성, SW 등록, 라우트 렌더 e2e, 번들 크기 확인.
- **의존:** T0.

### T2 — 제작자 인증 (US-002)
- **범위:** Supabase 매직링크, AuthProvider/세션, 보호 라우트, RLS 정책 마이그레이션.
- **산출물:** 로그인 플로우 + RLS로 타계정 차단 + 수신 무인증 보장.
- **검증:** 로그인 세션 지속, 타계정 접근 거부(RLS 테스트), 인코그니토 수신 OK e2e.
- **의존:** T1.

### T3 — CC0/RF 카탈로그 + 라이선스 게이트 (US-005)
- **범위:** `lib/licenseGate.ts`(화이트리스트/하드밴), 프로비넌스 스키마, 초기 CC0 카탈로그 시드(Pixabay 등), `tracks` 테이블.
- **산출물:** 검증된 CC0 무드 카탈로그 + ingestion 게이트.
- **검증:** 게이트 단위 테스트(CC0 통과 / NC·ND·불명 거부), 프로비넌스 존재, KOMCA 배제 확인.
- **의존:** T1. (T2와 병렬 가능)

### T4 — 음악 동기화 엔진 (US-004)
- **범위:** `TrackSource` 인터페이스 + `HostedAudioSource`(먼저) + `SoundCloudSource`. 싱크 엔진(IntersectionObserver→seekTo), iOS ▶ 언락, setVolume 페이드.
- **산출물:** 소스 무관 스크롤 동기 재생 엔진.
- **검증:** 동형성 테스트(동일 인터페이스), 싱크 단위 테스트(IO mock→seekTo), 수동 iOS 언락 확인.
- **의존:** T3.

### T5 — 편지 작문 + 음악 큐 연출 (US-003)
- **범위:** 단락 에디터, SC paste-URL `lib/scOembed.ts` 검증, CC0 무드 픽커, 단락별 큐 저장, 광고 경고.
- **산출물:** 편지 작성 + 연출 UI + 영속화.
- **검증:** oEmbed 검증 단위 테스트(비200 거부), 큐 저장/로드, 광고 경고 표시.
- **의존:** T2, T4.

### T6 — 템플릿 / 타이포 (US-006)
- **범위:** 5~7 템플릿 테마(색·타이포·레이아웃), 선택·지속, 모바일 페이지네이션.
- **산출물:** 템플릿 시스템 + 작성/수신 양쪽 적용.
- **검증:** 템플릿 전환·지속, 긴 편지 클리핑 없음(반응형 테스트).
- **의존:** T5.

### T7 — 전달 링크 + 프라이버시 (US-007)
- **범위:** `lib/token.ts`(≥128bit), 암호 해시(서버), claim-and-bind, expiry/revoke, noindex 헤더, `get_letter_by_token` RPC/Edge Function.
- **산출물:** 안전한 capability-URL 발급·해석.
- **검증:** 토큰 엔트로피 테스트, 암호 게이트, claim-bind 2번째 기기 거부, revoke 즉시 반영, noindex 헤더.
- **의존:** T2.

### T8 — 수신자 무설치 웹뷰 (US-008)
- **범위:** `/l/:token` 뷰, AudioUnlockGate("열기 ▶"), 스크롤 동기 재생, SC liveness→CC0 폴백(무음0), CC-BY 크레딧, 접근성 텍스트 레이어.
- **산출물:** 통합 수신 경험(최종 합류 지점).
- **검증:** 인코그니토 오픈→동기 재생 e2e, SC 삭제→폴백, 크레딧 렌더, 콜드<3s.
- **의존:** T4, T5, T7.

### T9 — 법적 안전장치 (US-009)
- **범위:** `/legal/takedown` 공개 채널, `takedowns` 처리→오디오 비활성화, SC 면책 경계(rip/proxy 없음 점검).
- **산출물:** 상시 takedown 채널 + 비활성화 경로.
- **검증:** 채널 공개, 통지→오디오 off(본문 유지) 테스트, SC 사용이 공식 embed만인지 코드 점검.
- **의존:** T3, T8.

### T10 — E2E + 디바이스 검증 (US-010)
- **범위:** Playwright happy + 불행경로 시나리오, 실기기 수동 체크리스트.
- **산출물:** 통과하는 e2e 스위트 + 디바이스 검증 문서.
- **검증:** e2e green, 불행경로 커버, 실기기 체크리스트 작성.
- **의존:** 전체.

## 완료 정의 (DoD) — 전 TASK 공통

- 해당 user story의 모든 acceptanceCriteria가 신선한 증거로 검증됨(`/verify-task`).
- `npm run typecheck && npm run test`(+ 관련 e2e) 통과.
- 별도 리뷰어 패스(code-reviewer/architect) 승인.
- `.omc/prd.json` 해당 스토리 `passes: true`, `tasks/todo.md` 리뷰 기록.
- 사용자 교정 발생 시 `tasks/lessons.md` 갱신.
