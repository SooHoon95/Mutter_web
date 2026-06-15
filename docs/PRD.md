# PRD: 감성 편지 앱 (MVP) — v4, 음악=SoundCloud + CC0 픽커 (2기둥)

## 0. 문서 상태 / 변경 이력
- v2: 손글씨 합성이 v1 핵심 → v3: 손글씨 v2 연기, "스크롤-동기 음악" v1 핵심 → **v4: 음악 소스 확정.**
- **v4 (2026-06-13):** YouTube(대사·광고)·Spotify/멜론(DRM·무계정 풀재생 불가) 기각. **SoundCloud(디바이스 PoC 검증) primary + CC0/로열티프리 무드 픽커(보장형) = 2기둥 출시.** 작성자 업로드는 v2로 연기(면책 기계장치 선구축 필요). 법무·기술·범위 3관점 적대적 검증(워크플로우) 반영.
- **핵심 리프레임:** 제품 = "동기화 음악"이 아니라 **읽는 순간을 연출하는 편지(sender-as-director)**. 음악은 연출의 한 악기.

## 1. 한 줄 목표 (v1)
발신자가 **편지의 어느 지점에서 어떤 음악이 차오를지 연출**해서, 읽는 사람이 **설치 없이 링크로 열어** 그 연출된 순간을 경험하는 모바일 웹/PWA.

### 핵심 가치 루프 (v1)
작성 + **단락별 음악 큐 연출**(SC 곡 붙여넣기 또는 CC0 무드 선택) → 무설치 링크 발급 →
수신자 **"편지 열기 ▶"** 탭 → 읽어내려가며 **연출된 지점마다 음악이 차오름**.

## 2. 원칙
1. **연출되는 편지가 본질.** "동기화 음악"은 보이지 않는다. 카카오 카드가 못 하는 *발신자의 연출*을 판다.
2. **무음 편지 0.** 모든 편지는 항상 우리가 수명을 통제하는 음악(CC0)을 갖는다. SC는 그 위의 보너스.
3. **감성 순간을 끊지 않는다.** 광고/끊김이 친밀한 순간에 나면 경험이 *역전*된다.
4. **수신자 무마찰은 신성.** 링크→웹뷰, 무계정·무설치, "열기 ▶" 탭 하나(오디오 언락 겸 의식).
5. **반쯤 만든 safe harbor는 없느니만 못하다.** 면책 절차를 100% 못 갖추면 그 기둥(업로드)은 켜지 않는다.
6. **$0 비용 + 기본값이 프라이버시.**

## 3. 핵심 의사결정 (확정)
| 항목 | 확정값 | 근거 |
| --- | --- | --- |
| v1 음악 | **SoundCloud(primary) + CC0 무드 픽커(보장)** 2기둥 | PoC 검증 + 무음0 보장 |
| 작성자 업로드 | **v2로 연기(out)** | $0에서 DMCA/OSP 면책 기계장치 선구축 필요 |
| 동기화 | 스크롤 동기(IntersectionObserver), 1곡 seekTo | 읽기 속도 정합 + 광고 최소 |
| 음악 추상화 | 단일 `TrackSource`(SoundCloudSource + HostedAudioSource) | 3기둥→2구현 |
| 제품 프레임 | **연출되는 편지(sender-as-director)** | 차별성 |
| 손글씨 | v2 moat | v3 결정 유지 |
| 링크 | 추측불가 ≥128bit + 암호 기본 ON + claim-and-bind + noindex | 친밀 콘텐츠 |

## 4. 음악 아키텍처 (v4)
**Decision:** v1은 **SoundCloud paste-URL을 primary, 큐레이션 CC0/RF "무드 픽커"를 보장형 fallback**으로 묶은 **2기둥**만 출시. SC는 유일하게 PoC 검증된 기둥이나 광고·삭제·embed비활성화로 통제 불가 → 항상 우리가 수명을 통제하는 호스팅 오디오(CC0)가 모든 편지에 음악을 보장. **Creator Upload는 v1 제외** — 면책 기계장치를 다 짓기 전엔 미출시(반쯤 만든 safe harbor = 인지하고 방치 신호).

| Pillar | 언제 | 합법성 | 한계 |
|---|---|---|---|
| **1. SoundCloud embed** (Widget API) | 발신자가 SC URL로 '우리 노래' 지정. **v1 primary** | OK — 공식 Widget API/canonical embed만. *오디오 바이트 fetch/저장/proxy 순간 면책 상실* | 검색 불가(paste-URL만), 광고 가능, 삭제 시 dead, embed-disabled/geo 실패, 한국 대중가요 빈약, 크로스페이드 불가(setVolume 램프만) |
| **2. Creator Upload** | 발신자 파일 업로드 | 조건부 — OSP 면책 *절차 이행* 필수, ToS 문구만으론 무방비 | **v1 제외(v2)**. 최악 실패=영구 무음, 업로드 마찰 |
| **3. CC0/RF 카탈로그** | 곡 미정/보장 음악. **v1 fallback="무드 픽커"** | 가장 안전 — CC0/PD 기본, CC-BY는 표기 시 | generic 사운드, 화이트리스트·프로비넌스 필요 |

## 5. 검증 상태 & 빌드 순서
- **SoundCloud PoC ✅ 검증 완료** (iOS Safari: "열기 ▶" 제스처 후 추가 탭 없이 스크롤 `seekTo` 동작, 순수 오디오, 무로그인 풀재생). 산출물: `poc/spike-music-soundcloud.html`.
- **빌드 순서:** ① `HostedAudioSource` + CC0 카탈로그 먼저(통제 가능 소스로 싱크 엔진 디리스크) → ② `SoundCloudSource`(검증됨, 블랙박스) → ③ (v2) Upload = HostedAudioSource + R2 PUT + 검증.

## 6. 수용기준 (AC)
- embed-disabled/private/geo/비200 SC URL은 **발신자 작성 시점에 거부**되고 수신자에게 도달 안 함(즉시 fallback 안내).
- 모든 편지는 발신자가 SC 곡을 안 골라도 CC0 무드 픽커 음악을 가진다 — **무음 편지 0**.
- 수신 로드 시 SC liveness 실패하면 카탈로그로 폴백, **편지는 절대 무음으로 안 떨어진다**.
- 모든 CC-BY 트랙은 제목·저작자·출처·라이선스가 편지 UI/크레딧 뷰에 렌더(미렌더 시 출시 차단).
- ingestion은 NC/ND/비화이트리스트 라이선스를 자동 거부, 통과 트랙마다 프로비넌스 레코드 존재.
- 스크롤 싱크 엔진은 소스 타입을 모른 채 `TrackSource` 인터페이스로 SC·호스팅 양쪽서 단락 경계 `seekTo`·`onProgress` 동작.
- iOS Safari에서 단일 "▶" 제스처가 SC·호스팅 양쪽 언락.
- 광고 포함 가능 SC 트랙은 발신자에게 send-time 경고 → 모르고 광고-편지 발송 방지.
- 푸터/ToS에 권리주장자 takedown 연락처 게시 + 통지 시 해당 편지 오디오 비활성화 가능.

## 7. v1 사용자 스토리
| ID | 제목 | family | 핵심 AC |
| --- | --- | --- | --- |
| US-001 | PWA 셸/단일 코드베이스 | infra | 콜드 <3s/4G, 매니페스트+SW+A2HS |
| US-002 | 제작자 인증(수신 무인증) | arch | 세션 지속, 타계정 403, 수신 인코그니토 OK |
| US-003 | 편지 작문 + 음악 큐 연출 | arch | SC paste-URL **oEmbed 검증**(불가 트랙 거부) + CC0 무드 픽커, 단락별 큐 |
| US-004 | 음악 동기화 엔진(`TrackSource`) | integration | SoundCloudSource+HostedAudioSource 단일 인터페이스, IntersectionObserver→seekTo, 열기▶ 언락, setVolume 페이드 |
| US-005 | CC0/RF 카탈로그 + 라이선스 게이트 | data | 화이트리스트(CC0/PD/CC-BY) ingestion 강제, NC/ND 하드밴, 트랙별 프로비넌스 |
| US-006 | 템플릿/타이포 | arch | 5~7 템플릿, 모바일 페이지네이션 |
| US-007 | 전달 링크 + 프라이버시 | infra | ≥128bit, 암호 기본 ON, claim-and-bind, noindex |
| US-008 | 수신자 무설치 웹뷰 | arch | 열기▶→스크롤 동기, **SC liveness→카탈로그 폴백(무음0)**, CC-BY 크레딧 렌더, <3s/4G |
| US-009 | 법적 안전장치(takedown 채널) | other | 권리주장자 연락처 공개, 통지 시 오디오 비활성화 |
| US-010 | E2E + 디바이스 검증 | testing | 작성→큐→링크→오픈→동기 음악 + 불행경로, 실기기 iOS·Android |

## 8. 프라이버시·안전 & 필수 법적 안전장치 (v1 = SC + CC0 한정)
- **Pillar 1(SC) 가드레일:** 공식 Widget API + canonical embed URL만. 스트림 URL rip·proxy·캐시·재호스팅 **금지**(면책 상실). embed-disabled/private 우회 금지 → 실패 시 graceful 폴백. SC 브랜딩/컨트롤 은폐·제휴 암시 금지.
- **Pillar 3(CC0/RF) 라이선스 화이트리스트 — ingestion 강제:** CC0/PD, CC-BY(표기 조건), *상업 사용 AND end-user 재배포 명시 허용* 벤더 라이선스만 통과. 외 전부 거부.
- **NC/ND 하드 밴:** CC-BY-NC, "개인/비상업 무료" 곡 금지. 스크롤용 트림/루프면 ND도 금지.
- **CC-BY 출처 표기 렌더:** 제목·저작자·출처·라이선스 표시(미표기=침해).
- **프로비넌스 저장(트랙별):** 출처 URL, 라이선스명+버전, 라이선스 텍스트 스냅샷, 취득일, 저작자.
- **한국 인접권 클리어:** KOMCA/FKMP 비관리 + RF 라이선스가 실연·음반(인접권)까지 커버 확인. "free 작곡 + 상업 마스터 녹음" 금지, RF 플랫폼 자체 녹음만. Pixabay/검증 FMA/벤더 우선.
- **공개 takedown 채널(공통):** 푸터/ToS에 권리주장자 이메일 + 절차 게시. *업로드 없어도* 지금 세움.
- **Capability URL:** 추측불가 + 암호 기본 ON + claim-and-bind + 텔레메트리 + expiry/revoke + noindex.

## 9. PRE-MORTEM (주요 3)
1. **편지 중간 광고(SC) — 기둥 킬러.** 취약 단락서 30초 광고 = 경험 역전. **완화:** send-time 광고 트랙 감지·플래그 → 무광고 인디 또는 CC0 유도. "광고 없음 보장"을 기능화.
2. **무음 편지(SC 삭제/takedown) — 최악 실패.** 키프세이크가 한참 뒤 소급 파손. **완화:** Upload v1 제외 + 생성 시 SC 메타 저장 + 수신 시 liveness→카탈로그 폴백. "절대 무음 아님"을 핵심 약속.
3. **얇은 차별성.** 수신자는 싱크를 인지 못함. **완화:** "연출되는 편지(sender-as-director)"로 리프레임 — "발신자가 *바로 여기서* 이 곡이 차오르게 의도".

## 10. 테스트 플랜
- **Unit:** 큐 모델, 라이선스 화이트리스트 거부, 토큰 엔트로피(≥128bit), oEmbed 검증, expiry/revoke.
- **Integration:** `TrackSource` 추상화(SC·호스팅 동형), IntersectionObserver→seekTo, 열기▶ 언락, SC liveness→폴백.
- **E2E:** happy(작성→큐→링크→오픈→동기) + 불행(광고 트랙 경고, embed-disabled 거부, SC 삭제→폴백, revoked 링크).
- **Observability:** 첫 재생 지연, 폴백 발생률, 광고 트랙 비율, embed 실패율, 콜드로드 <3s/4G.

## 11. 기술 노트
- **SC Widget API:** 키 불필요. `play/pause/seekTo(ms)/setVolume` + `PLAY_PROGRESS/PLAY/PAUSE/FINISH/READY/ERROR`. 싱크 엔진은 `PLAY_PROGRESS`(현재 ms) 바인딩 + 단락 경계 `seekTo`. iOS 제스처 언락 후 seekTo 생존 확인.
- **검색 불가 → paste-URL only:** SC Data API(검색) 수년째 폐쇄. 인앱 검색 박스 불가. **자격증명 없는 oEmbed**(`GET soundcloud.com/oembed?url=<track>`)로 URL 검증 → 비200/ERROR면 즉시 거부.
- **단일 `TrackSource` 추상화:** `load/unlock/play/pause/seekTo(ms)/setVolume/onProgress/onFinish`. 구현 = `SoundCloudSource`(Widget) + `HostedAudioSource`(`<audio>`, `timeupdate`→onProgress; CC0 카탈로그·(v2)업로드 모두 R2 URL이라 동일 구현). 싱크 엔진은 소스를 모름.
- **업로드 파이프라인($0, v2):** Cloudflare R2 무료(10GB, **egress 무료**). **.mp3+.m4a/.aac 한정 → 트랜스코딩 불필요**(iOS 포함 네이티브 재생).
- **크로스페이드:** v1 = setVolume 램프 페이드. Web Audio 갭리스는 호스팅 `<audio>`(AudioContext)에서만 → 후순위.

## 12. v2 (deferred)
- **Creator Upload 게이트(출시 전 100% 필수, 하나라도 빠지면 컷):** US DMCA 지정수신인 등록(~$6, 최고 레버리지) + 한국 권리주장자 수신인 공개 + 운영 notice-and-takedown 파이프라인 + counter-notice 루프 + 반복침해자 종료 정책(strike 로그) + 업로더 소유권 warranty 클릭스루(타임스탬프/IP)+indemnify + bound-letter 전용 비공개(검색·다운로드 금지) + 곡당 1곡·크기/길이 캡.
- **손글씨 합성 전체(moat)** — 음절-블록, BRR≥70%, 가이드 캡처, 사칭방지, 생체PII, 흘림체.
- OCR · 둘만의 아카이브+앱 연결 · 네이티브 앱 · 자유 에디터 · Web Audio 갭리스 크로스페이드 · (인앱 SC 검색=불가) · 콘텐츠 핑거프린팅($0 밖).

## 13. ADR
- **Decision:** v1 = SoundCloud(primary, oEmbed 검증) + CC0 무드 픽커(보장) 2기둥, 단일 `TrackSource`, 무설치 capability-URL PWA. 업로드·손글씨 v2. 제품 프레임 = 연출되는 편지.
- **Drivers:** ①감성 무중단 + 무음0 ②$0 ③면책 리스크 회피.
- **Alternatives:** YouTube(대사·광고→기각) / Spotify·멜론(무계정 풀재생 불가→기각) / Upload-now(면책 기계장치 비용→v2) / 3기둥 동시(복잡·위험→2기둥).
- **Consequences:** (+)검증된 소스+무음0+법적 안전. (−)SC 한국 대중가요 커버 빈약(→업로드 v2가 보완) (−)'우리 노래' 일부는 CC0로 대체.
- **Follow-ups:** CC0 카탈로그 큐레이션 → SoundCloudSource → (감성 검증 후) Upload 게이트 → 손글씨 moat.

## 14. 비용 ($0)
- SC=음원비 0, CC0=무료, R2=무료 티어(egress 무료). 유료 전환은 규모 후(라이선스 음원, 손글씨 GPU, 핑거프린팅).
