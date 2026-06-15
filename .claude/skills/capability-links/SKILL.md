---
name: capability-links
description: Use when generating delivery tokens (>=128bit), password-default-ON, claim-and-bind, expiry/revoke, noindex, or recipient access control. Trigger on "전달 링크", "토큰", "암호", "claim-and-bind", "expiry", "revoke", "noindex", "수신 접근".
user-invocable: false
---

# Capability URL (전달 링크 + 프라이버시) 규칙

친밀 콘텐츠 → **기본값이 프라이버시**. 링크는 권한 그 자체(capability)이므로 추측·유출·인덱싱을 모두 막는다.

## 토큰 (≥128bit, 추측 불가)

- `crypto.getRandomValues`로 ≥16바이트(128bit) 생성 → URL-safe base64url 인코딩.
- **순차 ID 금지.** 토큰이 곧 라우트(`/l/:token`). DB의 letter PK는 따로(노출 안 함).
- 생성은 `src/lib/token.ts` 순수 함수 `generateToken()` + `assertTokenEntropy()`. 단위 테스트로 길이·엔트로피·유일성 못 박기.

## 암호 기본 ON

- 링크 발급 시 암호가 **기본 활성**. 발신자가 명시적으로 끌 수 있으나 기본은 ON.
- 암호는 **서버(Edge Function/RPC)에서 해시 비교**. 평문·해시를 수신 클라이언트에 내려보내지 않는다.
- 수신자는 토큰 + 암호로만 본문 획득(`supabase-data`의 `get_letter_by_token`).

## claim-and-bind

- 첫 오픈 기기가 링크를 "claim" → 그 device id에 바인딩. 이후 **다른 기기에서 원본 URL 무력화**(전달·스크린샷 유출 완화).
- device id = 첫 오픈 시 생성한 무작위 식별자(localStorage). 서버가 `delivery_links.claimed_device_id`에 저장.
- 바인딩 충돌 시 정중한 거부 화면(+ 발신자에게 재발급 안내).

## expiry / revoke

- `expiresAt`(옵션, 발신자 설정) 경과 → 거부.
- `revokedAt` 설정 시 즉시 거부. 발신자가 `/sent`에서 revoke 가능.
- liveness 텔레메트리(접근 시각·횟수·실패) 기록(이상 감지·revoke 판단 근거).

## noindex / 비공개

- 수신 라우트는 `<meta name="robots" content="noindex,nofollow">` + `X-Robots-Tag`(Netlify 헤더).
- 공개 인덱스·사이트맵에 토큰 URL 미노출. 소셜 프리뷰(OG)도 본문 누설 금지(중립 카드).

## 자가 점검

- 토큰이 `crypto.getRandomValues` 기반 ≥128bit이고 순차성이 없는가.
- 암호 비교·해시가 서버에서만 이뤄지는가(클라이언트로 해시 전송 없음).
- claim-and-bind가 두 번째 기기를 거부하는가.
- expiry·revoke가 즉시 반영되는가.
- 수신 라우트에 noindex 헤더/메타가 있는가.
