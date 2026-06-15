---
name: license-compliance
description: Use when ingesting the CC0/RF catalog, enforcing license whitelist (CC0/PD/CC-BY), hard-banning NC/ND, storing provenance, rendering CC-BY credits, building the takedown channel, or handling Korean neighboring rights. Trigger on "라이선스", "CC0", "카탈로그", "프로비넌스", "크레딧", "takedown", "NC/ND", "인접권".
user-invocable: false
---

# 라이선스 준수 규칙

"반쯤 만든 safe harbor는 없느니만 못하다." 라이선스 게이트는 ingestion에서 **자동 강제**한다(사람 판단에 의존 금지).

## 라이선스 화이트리스트 (ingestion 강제)

통과 가능한 것만:
- **CC0 / Public Domain** — 무조건 통과.
- **CC-BY** — 표기(크레딧) 조건부 통과. 크레딧 미렌더 시 출시 차단.
- **벤더 RF 라이선스** — *상업 사용 AND end-user 재배포 명시 허용*일 때만(예: Pixabay 라이선스).

하드 밴(자동 거부):
- **CC-BY-NC / CC-BY-ND** 및 모든 NC/ND. "개인/비상업 무료" 곡.
- 스크롤용 트림/루프를 만들 거면 ND도 금지(파생 제한).
- 비화이트리스트·라이선스 불명 = 거부.

게이트는 `src/lib/licenseGate.ts` 순수 함수 `assertAllowedLicense(track)` — 단위 테스트로 CC0 통과 / NC·ND·불명 거부를 못 박는다.

## 프로비넌스 (트랙별 필수)

통과한 모든 트랙은 레코드 보유:
- 출처 URL, 라이선스명 + 버전, **라이선스 텍스트 스냅샷**, 취득일, 저작자.
- `tracks` 테이블(또는 `catalog/provenance.json`)에 저장. 프로비넌스 없는 트랙은 카탈로그에 들어갈 수 없다.

## CC-BY 크레딧 렌더

- 모든 CC-BY 트랙은 제목·저작자·출처·라이선스를 수신 편지 UI/크레딧 뷰에 렌더. **미렌더 = 침해 → 출시 차단.**

## 한국 인접권 (실연·음반)

- RF 라이선스가 작곡(저작권)뿐 아니라 **실연·음반(인접권)까지 커버**하는지 확인. "free 작곡 + 상업 마스터 녹음" 조합 금지 — RF 플랫폼 자체 녹음만.
- KOMCA/FKMP 관리곡 배제. Pixabay/검증된 FMA/벤더 우선.

## SoundCloud (Pillar 1) 경계

- 공식 Widget API + canonical embed URL만. 오디오 바이트 fetch/저장/proxy/재호스팅 = **면책 상실, 절대 금지**.
- embed-disabled/private 우회 금지 → 실패 시 graceful 폴백(CC0).
- 광고 포함 가능 트랙은 send-time 경고(발신자가 모르고 광고-편지 발송 방지).

## 공개 takedown 채널 (업로드 없어도 지금 세움)

- 푸터/ToS(`/legal/takedown`)에 권리주장자 연락처(이메일) + 절차 게시.
- 통지 시 해당 편지 오디오 비활성화 가능(`takedowns` 레코드 → 편지 오디오 off, 본문은 유지).

## 자가 점검

- ingestion 게이트가 CC0/PD/CC-BY/허용 벤더만 통과시키고 NC/ND·불명을 거부하는가(테스트 존재).
- 통과 트랙마다 프로비넌스(라이선스 텍스트 스냅샷 포함)가 있는가.
- CC-BY 크레딧이 수신 뷰에 실제 렌더되는가.
- SC 오디오를 rip/proxy/cache 하지 않는가.
- takedown 채널이 공개돼 있고 오디오 비활성화 경로가 동작하는가.
