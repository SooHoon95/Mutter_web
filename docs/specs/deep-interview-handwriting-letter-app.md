# Deep Interview Spec: 손글씨 감성 편지 앱 (Handwriting Letter App)

## Metadata
- Interview rounds: 9
- Final ambiguity score: **15%** (clarity 85%)
- Type: greenfield (crypto-bot 세션에서 진행했으나 무관한 신규 제품)
- Threshold: 20% — **PASSED**
- Generated: 2026-06-12
- Status: PASSED

## Clarity Breakdown (final)
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.40 | 0.380 |
| Constraint Clarity | 0.92 | 0.30 | 0.276 |
| Success Criteria | 0.65 | 0.30 | 0.195 |
| **Total Clarity** | | | **0.851** |
| **Ambiguity** | | | **0.149 (≈15%)** |

## Goal (one sentence)
사용자가 **자기 손글씨로 "인식 가능한"** 손글씨 + 음악(외부 임베드) + 디자인으로 감성 편지를 만들어,
**설치 없이 열리는 웹 링크**로 특정인에게 보내는 **모바일 웹/PWA** B2C 서비스.

## Core Value Loop (MVP)
few-shot로 내 손글씨 스타일 추론 → 텍스트를 내 손글씨로 렌더 → 음악(외부) 임베드 →
무설치 웹 링크 발급 → 수신자가 웹에서 열어 손글씨+음악 편지 감상.

## Constraints
- **플랫폼**: 모바일 웹 / PWA (v1). 수신자=웹 필수(무설치). 제작자도 웹. 단일 코드베이스.
- **손글씨 입력**: few-shot — 몇 단어 샘플로 스타일 추론.
- **손글씨 합격선**: "내 글씨로 **인식 가능**" (위조/구별불가 수준 아님).
- **음악**: 외부 링크 임베드(Spotify/YouTube). 호스팅·라이선스 부담 없음.
- **계정**: 제작자(보내는 사람)만 계정 필요. 수신자는 계정 불필요(링크).
- **시장**: B2C 출시형 제품 (여러 사람이 쓰는 서비스).

## Non-Goals (v1에서 명시적으로 제외)
- ① OCR (손편지 → 텍스트 디지털화) → **v2**
- ⑤ 둘만의 아카이브 + 앱끼리 연결(관계 기반 저장) → **v2**
- 네이티브 앱 (iOS/Android) → **v2** (기능적 이득이 v2 기능과 정렬될 때)
- 음악 파일 호스팅 / 인앱 라이선스 음원 → 비목표
- 손글씨 "위조 수준(구별 불가)" 품질 → 비목표 (인식 가능 수준이면 합격)

## Acceptance Criteria (testable)
- [ ] AC1: 사용자가 few-shot 샘플(몇 단어)을 제공하면, 그 스타일로 임의 텍스트가 손글씨로 렌더된다.
- [ ] AC2: 생성된 손글씨를 글씨 주인(또는 글씨를 아는 사람)이 블라인드로 보고 "이건 내(그) 글씨"라고 인식한다 — 정량 목표는 ralplan에서 확정(예: 블라인드 인식률 ≥ X%).
- [ ] AC3: few-shot 결과가 합격선 미달일 때, 추가 샘플을 더 받아 보강하는 graceful-degradation 폴백이 작동한다.
- [ ] AC4: 편지에 외부 음악(Spotify/YouTube) 링크를 붙이면 수신 화면에서 재생/플레이어가 동작한다.
- [ ] AC5: 편지 생성 시 추측 불가한 무설치 웹 링크가 발급되고, 그 링크를 연 사람은 앱 설치 없이 손글씨+음악 편지를 본다.
- [ ] AC6: 제작자는 계정으로 로그인하고, 수신자는 계정 없이 링크만으로 연다.
- [ ] AC7: 전체 흐름이 모바일 웹/PWA 환경에서 동작한다.

## Assumptions Exposed & Resolved (challenge log)
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 손글씨가 꼭 "내 글씨"여야 한다 | [Contrarian R4] 일반 폰트로 대체하면 90% 가치를 10% 비용에? | **확정: 내 글씨가 해자(moat).** 일반 폰트 대체 기각 |
| 5개 기능 다 필요 | [Simplifier R6] 빼도 가치 남는 최소는? | **MVP = ②손글씨+③음악+④링크.** OCR·아카이브 v2 |
| few-shot 입력으로 "인식 가능" 달성 | [R5↔R7 긴장] few-shot + 인식가능 = 손글씨 생성 연구 프론티어 | **graceful degradation 폴백 명시.** ralplan 아키텍트 1순위 실현가능성 검증 |
| 네이티브가 더 좋다 | [R9] 공수 빼고 기능적 이득은? | v1 기능엔 **웹/PWA가 기능적으로도 우위.** 네이티브는 v2 |

## Technical Context (greenfield, risk-first)
- **핵심 리스크 = few-shot 손글씨 합성("인식 가능" 바).** 후보 접근: style-conditioned diffusion / few-shot handwriting GAN / 스타일 임베딩 + 글리프 합성. 폴백: 샘플 추가 수집.
- 음악: 외부 oEmbed / iframe 임베드.
- 전달: 서명된 비밀 링크(unguessable token). **링크 만료 vs 영구 정책 = open decision.**
- 플랫폼: PWA (단일 코드베이스, 제작·수신 양측 웹).

## Ontology (Key Entities) — 10개, 수렴 100%
| Entity | Type | 비고 |
|--------|------|------|
| User | core | 제작자(계정 보유) |
| Letter | core | 핵심 제작물 |
| HandwritingStyle | core | per-user 학습 스타일/임베딩 |
| HandwritingSample | supporting | few-shot 입력 샘플 |
| MusicAttachment | supporting | 외부 임베드 참조 |
| LetterDesign/Template | supporting | 편지 디자인/테마 |
| Recipient | supporting | 무계정 수신자 |
| DeliveryLink | core | 무설치 비밀 링크 |
| Archive | v2 | 둘만의 기록 |
| Connection/Pairing | v2 | 앱끼리 연결 |

## Ontology Convergence
| Round | Entities | New | Stable | Stability |
|-------|----------|-----|--------|-----------|
| 1 | 7 | 7 | - | N/A |
| 2 | 8 | 1 | 7 | 88% |
| 3 | 9 | 1 | 8 | 89% |
| 4 | 10 | 1 | 9 | 90% |
| 5 | 10 | 0 | 10 | 100% (수렴) |
| 6–9 | 10 | 0 | 10 | 100% (안정) |

## Open Decisions for ralplan
1. 링크 영구성(만료 vs 영구) + 프라이버시 모델.
2. few-shot 모델 구체 접근 + 합격선 **정량 지표**(블라인드 인식률 목표 %).
3. 편지 디자인/템플릿 범위(몇 종, 커스터마이즈 정도).
4. 손글씨 합성 **인프라 위치**(온디바이스 vs 서버 추론) + 비용.

## Interview Transcript (9 rounds)
- **R1** [Goal] 누구를 위한 거? → **여러 사람 쓰는 서비스(B2C 출시형)**
- **R2** [Goal] 5기능 중 심장? → **감성 편지를 만들어 보낸다(제작+전달 경험)**
- **R3** [Constraints] 수신 방식? → **하이브리드: 링크 전달 + (양측 앱이면)아카이브** → 1:1↔관계 긴장 해소
- **R4** [Contrarian] 꼭 내 글씨? → **그렇다(해자). 모델링 필요 인정**
- **R5** [Success] 손글씨 합격선? → **"내 글씨로 인식 가능"**
- **R6** [Simplifier] MVP 최소? → **②손글씨+③음악+④링크.** OCR·아카이브 v2
- **R7** [Constraints] 손글씨 입력법? → **few-shot(몇 글자 추론)**
- **R8** [Constraints] 음악 출처? → **외부 링크 임베드(Spotify/YouTube)**
- **R9** [Constraints] 플랫폼? → (위임) **기능 평가 결과 v1 모바일 웹/PWA, v2 네이티브**
