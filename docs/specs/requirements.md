# 요구사항 명세서 (SRS) — letter-app v1

> 출처: `docs/PRD.md`(v4) + `.omc/prd.json`. 본 문서는 PRD를 **검증 가능한 요구사항**으로 전개한다.
> 상태: v1 빌드 대상 확정(2026-06-16). 손글씨 합성은 v2(비목표).
> 용어: **MUST**(필수) / **SHOULD**(권장) / **MAY**(선택).

## 1. 제품 개요

- **제품:** letter-app — "연출되는 편지(sender-as-director)" 감성 편지 PWA.
- **한 줄 정의:** 발신자가 편지의 어느 지점에서 어떤 음악이 차오를지 연출하고, 수신자가 설치 없이 링크로 열어 스크롤하며 그 순간을 경험한다.
- **플랫폼:** 모바일 웹 / PWA. 단일 코드베이스가 제작(인증) + 수신(무인증) 경로를 모두 제공.
- **대상 브라우저:** iOS Safari(현재+1), Android Chrome(현재+1).
- **비용 제약:** $0(SC 음원비 0, CC0 무료, 무료 티어 인프라).

## 2. 액터

| 액터 | 설명 | 인증 |
|---|---|---|
| 발신자(제작자) | 편지를 작성하고 음악을 연출, 링크 발급 | 매직링크 로그인 필요 |
| 수신자 | 링크로 편지를 열어 감상 | 무인증(토큰/암호/claim-bind로 통제) |
| 권리주장자 | 음악 권리 침해 신고 | 무인증(공개 채널) |

## 3. 기능 요구사항 (FR)

### FR-1. PWA 셸 (US-001)
- FR-1.1 (MUST) 유효한 웹 매니페스트(name, icons 192/512/maskable, theme_color, display: standalone, start_url) 제공.
- FR-1.2 (MUST) 서비스워커 등록 — 앱 셸 precache, 수신 편지 데이터는 network-first.
- FR-1.3 (MUST) A2HS(홈 화면 추가) 동작(HTTPS + 유효 매니페스트 + SW).
- FR-1.4 (MUST) 단일 코드베이스가 제작 라우트(`/create` 등)와 수신 라우트(`/l/:token`)를 분기.
- FR-1.5 (MUST) 콜드 의미 렌더 < 3초 / 4G(라우트 코드 스플릿, ▶ 이후 오디오 lazy-mount).

### FR-2. 제작자 인증 (US-002)
- FR-2.1 (MUST) 이메일 매직링크 로그인(`signInWithOtp`), 세션 지속(재방문 유지).
- FR-2.2 (MUST) 타계정 자원 접근은 **RLS로 서버에서 차단** → 앱은 403/404로 표면화.
- FR-2.3 (MUST) 수신 라우트는 인증을 요구하지 않음(인코그니토·무계정 OK).
- FR-2.4 (SHOULD) 비로그인 상태로 `/create` 접근 시 `/login` 리다이렉트.

### FR-3. 편지 작문 + 음악 큐 연출 (US-003)
- FR-3.1 (MUST) 편지를 단락(paragraph) 단위로 작성·편집·재정렬.
- FR-3.2 (MUST) SC paste-URL 입력 시 **oEmbed로 검증** → 비200/ERROR/embed-disabled/private/geo 트랙은 **작성 시점 거부** + CC0 폴백 안내.
- FR-3.3 (MUST) CC0 무드 픽커에서 곡 선택.
- FR-3.4 (MUST) 단락별 음악 큐(어느 단락에서 어떤 트랙이 차오를지) 지정·저장.
- FR-3.5 (MUST) 광고 포함 가능 SC 트랙은 send-time 경고.
- FR-3.6 (SHOULD) 라이브 프리뷰(작성자 화면에서 연출 미리보기).

### FR-4. 음악 동기화 엔진 (US-004)
- FR-4.1 (MUST) 단일 `TrackSource` 인터페이스(load/unlock/play/pause/seekTo/setVolume/onProgress/onFinish)로 `SoundCloudSource`(Widget API) + `HostedAudioSource`(`<audio>`)를 동형 제어.
- FR-4.2 (MUST) IntersectionObserver로 단락 진입 감지 → 추가 탭 없이 `seekTo`.
- FR-4.3 (MUST) iOS Safari 단일 "▶" 제스처가 SC·호스팅 양쪽 오디오를 언락.
- FR-4.4 (MUST) 곡 전환·페이드는 `setVolume` 램프(Web Audio 크로스페이드는 v2).
- FR-4.5 (MUST) 싱크 엔진은 소스 타입을 모른 채 인터페이스로만 동작.

### FR-5. CC0/RF 카탈로그 + 라이선스 게이트 (US-005)
- FR-5.1 (MUST) ingestion이 CC0/PD/CC-BY(+상업·재배포 허용 벤더)만 통과, NC/ND·비화이트리스트 자동 거부.
- FR-5.2 (MUST) 통과 트랙마다 프로비넌스(출처 URL·라이선스명+버전·라이선스 텍스트 스냅샷·취득일·저작자) 저장.
- FR-5.3 (MUST) 한국 인접권(실연·음반) 커버 확인, KOMCA 관리곡 배제.
- FR-5.4 (MUST) 보장형 무드 카탈로그로 모든 편지가 음악을 가질 수 있어야 함(무음 0의 원천).

### FR-6. 템플릿 / 타이포 (US-006)
- FR-6.1 (MUST) 5~7개 큐레이션 템플릿 선택·지속(pick-not-freeform).
- FR-6.2 (MUST) 긴 편지 모바일 페이지네이션, 가로 스크롤·클리핑 없음.

### FR-7. 전달 링크 + 프라이버시 (US-007)
- FR-7.1 (MUST) ≥128bit 추측불가 토큰(`crypto.getRandomValues`), 순차 ID 없음.
- FR-7.2 (MUST) 암호 기본 ON(서버 해시 비교), claim-and-bind(첫 기기 귀속 후 타기기 무력화).
- FR-7.3 (MUST) expiry/revoke(발신자가 무효화 가능, 즉시 반영).
- FR-7.4 (MUST) 수신 라우트 noindex(meta + X-Robots-Tag), 공개 인덱스 미노출.

### FR-8. 수신자 무설치 웹뷰 (US-008)
- FR-8.1 (MUST) 무계정·무설치로 "열기 ▶" → 스크롤 동기 음악.
- FR-8.2 (MUST) 수신 로드 시 SC liveness 실패 → 카탈로그 폴백. **무음 편지 0**(절대 무음 아님).
- FR-8.3 (MUST) 모든 CC-BY 트랙의 제목·저작자·출처·라이선스 크레딧 렌더.
- FR-8.4 (MUST) 첫 의미 렌더 < 3초 / 4G.
- FR-8.5 (MUST) 접근성 — 텍스트 레이어를 스크린리더가 읽을 수 있어야 함.

### FR-9. 법적 안전장치 (US-009)
- FR-9.1 (MUST) 푸터/ToS(`/legal/takedown`)에 권리주장자 takedown 연락처·절차 공개.
- FR-9.2 (MUST) 통지 시 해당 편지 오디오 비활성화 가능(본문은 유지).
- FR-9.3 (MUST) SC 스트림 rip·proxy·캐시·재호스팅 없음(공식 embed만 — 면책 경계).

### FR-10. E2E + 디바이스 검증 (US-010)
- FR-10.1 (MUST) 자동 e2e: 작성→큐→링크→인코그니토 오픈→스크롤 동기 음악(happy path).
- FR-10.2 (MUST) 불행경로 e2e: 광고 트랙 경고, embed-disabled 거부, SC 삭제→카탈로그 폴백, revoked 링크.
- FR-10.3 (MUST) 실기기 iOS·Android 각 1대 수동 통과 체크리스트.

## 4. 비기능 요구사항 (NFR)

- **성능:** 콜드 의미 렌더 <3s/4G. 오디오·iframe은 ▶ 이후 lazy-mount(façade)로 초기 예산 제외.
- **보안/프라이버시:** 기본값이 프라이버시(암호 ON·noindex·비공개). service role key 클라이언트 노출 금지. RLS로 소유권 강제.
- **법적 안전:** 라이선스 게이트 자동 강제, 프로비넌스 보존, takedown 채널 상시. 반쯤 만든 면책 기능은 출시하지 않음.
- **신뢰성:** 무음 편지 0(SC 실패 시 CC0 폴백). 죽은 임베드여도 본문은 항상 보임.
- **비용:** $0 유지(무료 티어 한도 내 설계).
- **접근성:** 수신 뷰 텍스트 레이어 스크린리더 가독, 시맨틱 태그.
- **유지보수성:** `lib` 순수 함수 단위 테스트 우선. `feature → feature` 의존 금지.

## 5. 데이터 모델 (요약)

- `Letter(id, owner_id, title, paragraphs[], template_id, created_at, updated_at)`
- `Paragraph(id, order, text, cue?: MusicCue)` — letters.paragraphs jsonb 가능.
- `MusicCue(source_type: 'soundcloud'|'hosted', ref, start_ms?)`
- `Track(id, source, title, author, license, provenance{...})` — CC0 카탈로그.
- `DeliveryLink(token, letter_id, password_hash?, claimed_device_id?, expires_at?, revoked_at?, telemetry)`
- `Takedown(id, letter_id, claimant, reason, created_at, resolved_at?)`

## 6. 제약 / 외부 의존

- SoundCloud Widget API(키 불필요, 블랙박스). Data API(검색) 폐쇄 → paste-URL only, oEmbed 검증.
- Supabase(무료 티어): Auth·Postgres·RLS·Storage·Edge Functions.
- Netlify(무료 티어): 정적 호스팅 + 헤더/리다이렉트.
- CC0 음원 출처: Pixabay/검증 FMA/벤더(상업·재배포 허용).

## 7. 비목표 (v1 제외)

작성자 음원 업로드 · 손글씨 합성 전체(BRR≥70%) · OCR · 둘만의 아카이브 · 네이티브 앱 · 자유 디자인 에디터 · Web Audio 갭리스 크로스페이드 · 인앱 SC 검색(API 폐쇄) · 콘텐츠 핑거프린팅.

## 8. 수용기준 추적성

각 FR는 `.omc/prd.json`의 user story acceptanceCriteria와 1:1 대응한다. TASK 완료는 `/verify-task`로 해당 AC를 신선한 증거와 함께 검증한 뒤 `passes: true`로 표시한다. 상세 TASK 분할·의존·빌드 순서는 `docs/specs/task-breakdown.md` 참조.
