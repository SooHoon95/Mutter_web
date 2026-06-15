# CLAUDE.md

Claude Code가 이 저장소에서 작업할 때 따르는 지침. 이 파일은 **대원칙과 스킬 트리거**만 담는다.
구체 규칙·예시·보일러플레이트는 모두 `.claude/skills/<name>/SKILL.md`에 있다.

---

## 프로젝트

**letter-app** — "연출되는 편지(sender-as-director)" 감성 편지 PWA.
발신자가 편지의 어느 지점에서 어떤 음악이 차오를지 **연출**하고, 수신자는 **설치 없이 링크**로 열어 스크롤하며 그 연출된 순간을 경험한다.

- **플랫폼:** 모바일 웹 / PWA (단일 코드베이스가 제작 라우트 + 수신 라우트).
- **스택:** Vite + React + TypeScript · Supabase(매직링크 인증·Postgres·RLS·Storage) · Netlify 배포 · Vitest(unit) + Playwright(e2e).
- **v1 음악 = 2기둥:** SoundCloud paste-URL(primary, oEmbed 검증) + 큐레이션 CC0/RF "무드 픽커"(보장형 fallback). **무음 편지 0** — SC 실패 시 항상 CC0 폴백.
- **핵심 추상화:** 단일 `TrackSource`(SoundCloudSource + HostedAudioSource) — 싱크 엔진은 소스 타입을 모른다.
- **링크:** 추측불가 ≥128bit + 암호 기본 ON + claim-and-bind + expiry/revoke + noindex.
- **비목표(v2):** 작성자 업로드(면책 기계장치 선구축 필요) · 손글씨 합성 moat(BRR≥70%) · OCR · 네이티브 앱.

SSOT(단일 진실 원천): 제품 결정은 `docs/PRD.md`(v4), 작업 분할은 `.omc/prd.json` + `docs/specs/task-breakdown.md`.
빌드·테스트·배포는 `web-build-test` 스킬을 참조한다.

---

## 대원칙

### 워크플로 오케스트레이션

1. **Plan 모드 기본** — 사소하지 않은 작업(3단계 이상 또는 아키텍처 결정)은 먼저 계획한다. 어긋나면 즉시 멈추고 재계획한다 — 그대로 밀어붙이지 않는다. 모호함을 줄이기 위해 상세 스펙(`docs/specs/`)을 먼저 작성한다. TASK 단위 작업은 `ralplan`으로 계획을 합의한다.
2. **서브에이전트 활용** — 메인 컨텍스트를 깨끗이 유지하도록 서브에이전트를 적극 사용한다. 리서치·탐색·병렬 분석·구현은 위임한다. 복잡한 문제일수록 컴퓨트를 더 투입하고, 서브에이전트 하나당 한 갈래에만 집중시킨다. 범위가 작으면 현재 컨텍스트에서 직접 처리하고, 여러 파일·책임으로 나뉠 때만 분산한다(`ultrawork`).
3. **자기 개선 루프** — 사용자 교정이 있을 때마다 패턴을 기록하고 같은 실수를 막을 규칙을 스스로 작성한다(`tasks/lessons.md`). 세션 시작 시 누적 교훈을 먼저 검토한다. (운영은 `self-improvement` 스킬)
4. **완료 전 검증** — 동작을 증명하지 않은 작업은 절대 완료로 표시하지 않는다. 테스트 실행·빌드·타입체크·로그로 정확성을 입증한다. "스태프 엔지니어가 승인할까?"를 스스로 묻는다. TASK 완료는 `ralph`로 수용기준(AC)을 신선한 증거와 함께 검증한다.
5. **우아함 추구 (균형)** — 사소하지 않은 변경에선 잠시 멈추고 "더 우아한 방법이 있나?"를 묻는다. 임시방편처럼 느껴지면 지금 아는 모든 것을 바탕으로 우아한 해법을 구현한다. 단순·명백한 수정은 건너뛴다 — 과한 엔지니어링 금지.
6. **자율적 버그 수정** — 버그 리포트를 받으면 바로 고친다. 로그·에러·실패 테스트를 가리키고 그것을 해결한다. 사용자의 컨텍스트 전환은 0이어야 한다.

### 핵심 원칙

- **무음 편지 0 / 감성 무중단** — 모든 편지는 항상 우리가 수명을 통제하는 음악(CC0)을 가진다. 광고·끊김이 친밀한 순간을 역전시키지 않게 한다. 이건 제품의 본질이지 옵션이 아니다.
- **수신자 무마찰은 신성** — 링크→웹뷰, 무계정·무설치, "열기 ▶" 탭 하나. 수신 경로에 어떤 마찰도 추가하지 않는다.
- **기본값이 프라이버시** — 추측불가 링크 + 암호 기본 ON + 비공개 + noindex. 친밀 콘텐츠는 안전한 쪽이 기본.
- **법적 안전은 반쯤 만들지 않는다** — 면책/라이선스 절차는 100% 갖추거나 그 기능을 끄거나 둘 중 하나. 반쯤 만든 safe harbor는 없느니만 못하다.
- **$0 비용** — SC=음원비 0, CC0=무료, 무료 티어 인프라. 유료 전환은 규모 후.
- **Simplicity / Root-Cause / Minimal Impact** — 가장 단순하게, 근본 원인을 동작으로 증명, 꼭 필요한 곳만 변경.
- **긍정 지시 / 근거 우선** — "하지 마"보다 "이렇게 한다". 추측 단정 금지, 관련 파일을 먼저 읽고 사실과 가설을 구분해 보고.

### 작업 관리 사이클

사소하지 않은 작업은 **Plan First → Verify Plan → Track Progress → Explain Changes → Document Results → Capture Lessons** 6단계를 따른다. 계획·진행·교훈은 `tasks/todo.md`·`tasks/lessons.md`로 관리하며, 포맷과 운영 규칙은 `self-improvement` 스킬이 정의한다.

**TASK 실행 루프 (사용자 지정):** 각 TASK는 `ralplan`(계획 합의) → `ultrawork`(서브에이전트 병렬 구현) → `ralph`(수용기준 검증) 순으로 진행하며, 모든 TASK가 끝날 때까지 멈추지 않는다.

---

## 스킬 트리거 인덱스

아래 트리거에 해당하면 해당 스킬을 **먼저 로드**한다. 여러 스킬이 동시에 트리거되면 모두 로드해 충돌 없이 적용한다. 상세 규칙·예시 코드·자가 점검은 각 `SKILL.md`에 있다.

| 스킬 | 로드 시점 (when-to-use) |
|---|---|
| `pwa-architecture` | 새 라우트·기능 모듈 추가, 폴더/레이어 구조 결정, 제작·수신 라우트 분기, 상태 관리·데이터 흐름 설계, 의존 방향 점검 |
| `web-coding-conventions` | 새 `.ts`/`.tsx` 파일 작성, 컴포넌트·타입·hook 네이밍, import 순서, 주석 작성, 커밋 직전 |
| `supabase-data` | Supabase 클라이언트 사용, 매직링크 인증·세션, 테이블/마이그레이션, **RLS 정책**(타계정 403), Storage(CC0 오디오), Edge Function |
| `music-sync` | `TrackSource` 인터페이스, `SoundCloudSource`(Widget API)·`HostedAudioSource`(`<audio>`), IntersectionObserver→seekTo, iOS ▶ 제스처 언락, setVolume 페이드, oEmbed 검증 |
| `capability-links` | 전달 토큰 생성(≥128bit), 암호 기본 ON, claim-and-bind, expiry/revoke, noindex, 수신 라우트 접근 제어 |
| `license-compliance` | CC0/RF 카탈로그 ingestion, 라이선스 화이트리스트(CC0/PD/CC-BY), NC/ND 하드밴, 프로비넌스 저장, CC-BY 크레딧 렌더, takedown 채널, 한국 인접권 |
| `web-build-test` | 빌드·dev 서버 실행(vite), 유닛 테스트(vitest), e2e(playwright), 타입체크·lint, PWA 매니페스트/SW, Netlify 배포 트러블슈팅 |
| `self-improvement` | 사소하지 않은 작업 시작, 작업 계획 작성, 진행 추적, 사용자 교정 기록, `tasks/todo.md`·`tasks/lessons.md` 운영, 세션 시작 회고 |
| `learning-comments` | 처음 도입하는 외부 SDK/API(SoundCloud Widget, Supabase, Web Audio, IntersectionObserver 등), 사용자가 "주석", "흐름 따라가게", "이해 안 가", "처음 써봐" 표현. 그 블록에 한해 풍부한 한국어 주석 작성 |

---

## 슬래시 커맨드 (`.claude/commands/`)

| 상황 | 커맨드 |
|---|---|
| 새 기능 모듈(라우트 + 컴포넌트 + hook) 추가 | `/new-feature` |
| 빌드·타입체크·테스트 실행 및 에러 분석 | `/build-web` |
| TASK 수용기준(AC) 검증 (ralph 스타일) | `/verify-task` |
| 커밋 | `/commit` |

자동 트리거: 코드 수정 후 → `/build-web`(타입체크·테스트) · TASK 완료 직전 → `/verify-task` · 커밋 요청 → `/commit`.

---

## 작업 절차

1. 요청 분석 → 영향 라우트·레이어·스킬 파악 → 관련 스킬 로드 → 구현 계획.
2. 새 TASK 또는 3개 이상 모듈 변경 시 `ralplan`으로 계획을 합의한 뒤 진행.
3. 관련 파일만 선택 Read (`node_modules/**`·빌드 산출물은 절대 읽지 말 것).
4. 구현 후 `npm run typecheck && npm run test` → 빌드 검증 (`web-build-test` 참조). 긴 작업은 `run_in_background`.
5. TASK 완료 전 `/verify-task`로 AC를 신선한 증거와 함께 검증. 자가 승인 금지 — 별도 패스로 `code-reviewer`/`verifier` 또는 `architect` 호출.
6. 커밋 메시지에 Co-Authored-By 금지. 비밀키(`.env`)·`node_modules`·빌드 산출물 커밋 금지.

---

## 보안 / 비밀 관리

- Supabase URL/anon key는 `.env`(VITE_ 접두사)로 관리, `.env`는 `.gitignore`. 서비스 롤 키는 클라이언트에 절대 노출 금지(Edge Function/서버에서만).
- SoundCloud는 **공식 Widget API + canonical embed URL만** 사용. 스트림 URL rip·proxy·캐시·재호스팅 금지(면책 상실).
- 수신 라우트는 무인증이되, 토큰·암호·claim-and-bind로 접근을 통제한다(`capability-links`).
