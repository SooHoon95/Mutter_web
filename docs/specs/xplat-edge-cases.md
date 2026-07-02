# 웹↔앱 크로스플랫폼 엣지케이스 감사 (2026-07-02)

웹(letter-app PWA)과 앱(Mutter iOS)이 하나의 Supabase 백엔드를 공유하며 사용자가 두 플랫폼을 오갈 때, 편지·초대·연결 플로우의 엣지케이스 전수 감사 결과.

- **프로세스:** deep-interview(모호도 16%) → ralplan 합의(Planner+Architect+Critic, 반복 2회) → 5범주 병렬 감사(에이전트 EC1~EC5) → 본 문서 → 수정(Phase B) → ralph 검증(Phase C).
- **판정 기준:** 처리됨 / 미처리 / 설계결함 / 미확인. 심각도: 치명(데이터 유실·발송 실패·보안·무마찰 위반) / 중 / 경.
- **케이스 포맷:** 시나리오 → 현재 동작(증거) → 판정/심각도 → 수정.
- 참조 계획: `.omc/plans/xplat-edge-cases-plan.md` · 스펙: `.omc/specs/deep-interview-xplat-edge-cases.md`

## 사용자 결정 기록 (2026-07-02)

| 쟁점 | 결정 |
|---|---|
| EC-3.6 링크 발송물 스레드 누락 | **로그인 수신자는 열람 시 자동저장** — `get_letter_by_token`에서 인증된 비소유자면 inbox upsert(서버 단일 지점, 웹·앱 동시 적용). 무계정 수신자는 종전대로 저장 없음(무마찰 유지). |
| EC-4.3 계정삭제 캐스케이드 소실 | **v1 수용+문서화** — 삭제 확인창에 "상대가 보관한 편지도 사라집니다" 경고 추가. 근본 수정(편지 익명화)은 v2 백로그. |
| EC-4.5 identity linking | 코드로 확정 불가 — **사용자 액션**: Supabase 대시보드 Auth 설정에서 "Link accounts with same email"(auto-linking) 활성 여부 확인 필요. 비활성이면 웹(이메일)·앱(구글, 같은 이메일) 계정이 분열됨. |

---

## 범주 1 — 전달링크 수명주기 & 받은함

### EC-1.1 발신 후 편지 수정 → 수신자 뷰 변경
- 시나리오: 발신자가 보낸 뒤 편지를 수정하면 수신자가 보는 내용이 바뀌는가.
- 현재 동작: letters는 단일 live row. `get_letter_by_token`(0018:115)과 받은함 경로 모두 같은 행을 읽음 → 수정 즉시 **양쪽 모두에** 반영. split-brain 없음, 발산 없음.
- 판정: **처리됨(의도 설계)** · 심각도: — · 후속: 발신자 고지 카피(링크 관리 UI) 백로그.

### EC-1.2 비로그인 앱에서 저장 버튼 노출 → 에러
- 현재 동작: iOS `canSaveToInbox`가 auth 미확인(ViewerModelData). 웹은 버튼 자체를 숨김(SaveToInboxButton.tsx:22 `if (!user) return null`).
- 판정: **미처리** · 심각도: 경 · 수정: optional `InboxUsecasable?` 주입(무인증 뷰어=nil) + EC-3.6 자동저장으로 버튼 자체가 대체됨.

### EC-1.3 revoke 링크 앱 수신 → 에러 표시
- `LINK_REVOKED` → iOS `MutterError(.linkRevoked)`(SupabaseErrorMapper:22), 웹 정규화(links.ts:165). **처리됨**.

### EC-1.4 만료 링크 → 에러 표시
- `LINK_EXPIRED` 게이트는 DB now() 기준(0018:97-99), 양 플랫폼 매핑 존재. **처리됨**.

### EC-1.5 send_to_connection 무암호 링크 처리
- password_hash NULL이면 암호 블록 스킵(0018:107-112). 웹·앱 동일 호출. **처리됨**.

### EC-1.6 한 편지에 복수 delivery_link(암호+무암호) 공존
- 토큰 단위 독립(revoke_link는 해당 토큰만, 0003:118-122). **처리됨(의도 설계)** — 한 편지가 서로 다른 보안 자세의 링크를 동시에 가질 수 있음을 명시.

### EC-1.7 만료 링크로 save_to_inbox 가능(유령 행) 〔신규〕
- save_to_inbox(0006:73-88)는 revoke만 검사, expires_at 미검사. get_my_inbox(0020:34-36)는 만료 필터 → 저장은 되나 목록에 안 보이는 유령 행 누적.
- 판정: **미처리** · 심각도: 경 · 수정: 0022에서 expires_at 검사 추가.

### EC-1.8 직접발송 링크 revoke → 받은함 즉시 반영
- get_my_inbox/get_thread가 revoke 필터 공유(0020). **처리됨**.

### EC-1.9 device lock(claim-and-bind) 크로스플랫폼
- 0011에서 완전 제거 확인 — 웹→앱/앱→웹 교차 열람 자유. **처리됨(명시적 설계 결정)**.

### EC-1.10 읽음확인 중복 카운트
- record_letter_open은 토큰당 open_count 누적(0017:59-63). 웹 열람+앱 열람=2. "읽음 여부"가 아니라 "열람 횟수" 의미론.
- 판정: **미확인(의도 불명)** · 심각도: 경 · 처리: 의미론 문서화(본 항목). UI가 boolean으로 쓸 땐 count≥1 해석.

### EC-1.11 예약공개 시계 처리
- 게이트는 DB now(), 시각은 UTC ISO 전달, 양 플랫폼 파싱 확인. **처리됨**.

---

## 범주 2 — 초대·연결 수명주기 & 1:1 불변식

### EC-2.1 동시 수락 레이스 → 1:1 위반
- 현재 동작: **0020_audit_round2.sql:96-100에 이미 정렬 advisory lock 존재**(least/greatest) — 이전 감사 라운드에서 수정됨. 계획 수립 시점의 0013 기준 가정은 구식이었음.
- 판정: **처리됨(0020)** · 참고: connections에 INSERT/UPDATE/DELETE RLS 정책 없음 → RPC가 유일한 쓰기 경로 확증(0009:20-21).

### EC-2.2 해제 후 old 초대 토큰 재사용 → 재연결
- 0020:89-93은 만료만 검사, `accepted_by IS NULL` 미검사 → 수락된 토큰을 7일 내 제3자가 재사용 가능(accepted_by 덮어씀).
- 판정: **미처리** · 심각도: 중 · 수정: 0022 `INVITE_ALREADY_USED` 가드(accept+get 양쪽). 주의: expires_at 필터가 먼저라 만료+수락 토큰은 INVITE_NOT_FOUND 응답(허용 동작, 버그 아님).

### EC-2.3 레거시 NULL expires_at 초대 무기한 유효
- 0013:78 의도적 호환. 신규는 7일.
- 판정: **설계결함** · 심각도: 경 · 수정: 0022에서 미수락 레거시 행 expires_at 백필(now()+7d).

### EC-2.4 앱 비로그인 초대 딥링크 → 로그인 후 도달
- coordinator.push가 미마운트 스택에 쌓였다가 로그인 후 "우연히" 뜸. 세션 확립 전 load() 실행 시 AUTH_REQUIRED 가능, 실패 시 재시도 없음(ConnectInviteModelData:34).
- 판정: **미처리(우연 동작+레이스+재시도 부재)** · 심각도: 중 · 수정: pending-deeplink 패턴(EC-5.1과 통합) + ConnectInviteView 재시도 버튼.

### EC-2.5 한쪽 disconnect → 상대 UI 반영 지연
- 웹은 focus 재조회(react-query 기본), iOS는 화면 진입 1회 로드만. 서버 정합성은 NOT_CONNECTED로 보장, UI만 지연.
- 판정: **미처리** · 심각도: 경 · 수정: iOS 포그라운드 복귀 시 재로드.

### EC-2.6 초대자가 그 사이 타인과 연결 → 미수락 초대
- inviter_has_connection 반환→UI 차단+서버 ALREADY_CONNECTED_OTHER 이중 방어. **처리됨**.

### EC-2.7 자기 초대 자기가 열기
- is_self UI 차단+서버 CANNOT_CONNECT_SELF. 웹·앱 동일. **처리됨**.

### EC-2.8 초대 취소 수단 없음 〔신규〕
- revoke RPC·UI 부재. 7일 만료가 유일한 소멸. 잘못 공유한 초대 취소 불가.
- 판정: **미처리(설계결함)** · 심각도: 경 · 수정: 0022 `revoke_connect_invite` RPC + 발급 직후 화면에 취소 버튼(웹·앱).

---

## 범주 3 — 답장·스레드

### EC-3.1 비연결 상대 답장 → 링크 폴백 (웹/앱 의미론)
- 웹: 낙관적 connection 탭→로딩 후 link 전환(Create.tsx:28-38, 탭 플리커 가능). 앱: 저장 후 연결 확인→link 탭 시트(ComposeModelData.sendReply). 도달점 동일.
- 판정: **처리됨** · 심각도: 경(웹 플리커, 수정 불요).

### EC-3.2 발송 직전 disconnect → NOT_CONNECTED 처리
- 웹: "연결된 사람이 아니에요…" 정규화(connections.ts:145-154). 앱: SupabaseErrorMapper에 NOT_CONNECTED 매핑 없음 → "보내지 못했어요"(원인 불명).
- 판정: **미처리(앱)** · 심각도: 중 · 수정: 매퍼에 NOT_CONNECTED 추가.

### EC-3.3 disconnect 후 스레드 히스토리 보존
- 스레드는 letters+inbox 파생, connections 비의존(0008/0010 의도). **처리됨**.

### EC-3.4 상대 계정삭제 → NULL nickname
- 타입 nullable+UI fallback 양쪽 확인. **처리됨**.

### EC-3.5 웹/앱 혼합 발송 스레드 일관성
- DB가 클라이언트 출처 무관. **처리됨**.

### EC-3.6 링크 발송물 미저장 → 스레드 누락 (직접발송과 비대칭)
- 직접발송=자동 inbox upsert(즉시 스레드), 링크발송=수신자 수동 저장 필요 → 미저장 시 양쪽 스레드 누락. "둘 사이 오간 편지 전부 확인" 요구와 충돌.
- 판정: **설계결함** · 심각도: 중 · **사용자 결정: 로그인 수신자는 열람 시 자동저장** — 0022 get_letter_by_token에서 인증된 비소유자 열람 시 inbox upsert(무계정은 종전대로). 웹·앱 수동 저장 버튼은 "저장됨" 표시로 대체.

---

## 범주 4 — 계정·플랫폼 전환

### EC-4.1 웹 발신 편지 앱 조회 / EC-4.2 앱 저장 받은함 웹 조회
- 동일 auth.uid() + RLS DB 레벨 격리. 양방향 **처리됨**.

### EC-4.3 발신자 계정삭제 → 수신자 보관 편지 무통보 소실
- FK 체인: auth.users → letters(owner_id CASCADE, 0002:17) → inbox(letter_id CASCADE, 0006:58)·delivery_links(CASCADE) → 수신자 받은함·스레드에서 소실. 웹·앱 동일 RPC(delete_my_account, 0007:7-12).
- 판정: **설계결함** · 심각도: 중 · **사용자 결정: v1 수용+문서화** — 삭제 확인창(웹·앱)에 "상대가 보관한 편지도 함께 사라집니다" 경고 추가. v2 백로그: 편지 익명화(owner sentinel)로 수신자 보관본 보존.

### EC-4.4 같은 기기 웹=A/앱=B 멀티계정
- localStorage(웹)·Keychain(앱) 물리 분리 — 데이터 오염 없음. 혼동은 UX 수준.
- 판정: **처리됨(데이터)/경(UX 문서화)**.

### EC-4.5 매직링크(웹)+소셜(앱, 동일 이메일) → 계정 분열 위험 〔신규〕
- config.toml:173 `enable_manual_linking=false`, auto-linking은 대시보드 설정 의존 — 코드로 확정 불가. 비활성이면 별개 user_id 생성→모든 데이터 분열.
- 판정: **미확인** · 심각도: 중(최악 치명) · 액션: **사용자가 Supabase 대시보드 확인**(위 결정 기록 참조).

### EC-4.6 앱 단독 최초 로그인 → 닉네임 온보딩 경로 없음 〔신규〕
- 웹은 로그인 직후 /set-nickname 게이트(Home.tsx:24-32). iOS AuthViewWrapperView는 항상 .signIn만 렌더, .onboardNickname으로 가는 경로 부재 — 닉네임 없이 메인 진입(상대에게 "이름 없음" 노출).
- 판정: **미처리** · 심각도: 중 · 수정: 인증 후 profile.nickname 비어 있으면 온보딩 화면 경유.

### EC-4.7 계정삭제 앱/웹 경로 일관성
- 양쪽 동일 delete_my_account RPC. **처리됨**.

---

## 범주 5 — Universal Links 활성 후 〔전부 "UL 활성 후" 표시〕

### EC-5.1 앱 설치+로그아웃+/l/ 탭 → 인증 게이트 충돌
- onOpenURL이 로그인 무관 coordinator.push(MainView:33-39) → 미로그인 시 NavigationStack 미마운트(MainView:54가 else 분기) → 화면 전환 없음. 2차: 로그인 완료 순간 쌓였던 라우트가 갑자기 뜸.
- 판정: **미처리** · 심각도: **치명**(수신 무마찰 위반) · 수정: pending-deeplink 패턴 — .letter는 인증 무관 무인증 뷰어(fullScreenCover+DeeplinkToken, inboxUsecase nil, get_letter_by_token은 anon grant 확인됨 0014:73-74).

### EC-5.2 로그아웃+/connect/ 탭 → 로그인 후 도달이 '우연'
- 스택 잔존으로 우연히 동작하나 설계 보장 없음(AuthViewWrapperView onComplete는 refresh만). 리그레션 위험.
- 판정: **미처리** · 심각도: 중 · 수정: pending-deeplink 명시 소비(로그인 완료 시 .connect push).

### EC-5.3 앱 미설치+UL → Safari 폴백
- iOS 플랫폼 보장+웹 경로 존재(AASA /l/*·/connect/*, netlify SPA). **처리됨**.

### EC-5.4 무인증 뷰어에서 저장 버튼 → AUTH_REQUIRED
- canSaveToInbox가 auth 미확인. B.2 구현 후 노출될 결함.
- 판정: **미처리** · 심각도: 중 · 수정: optional inboxUsecase(nil=버튼 없음) + EC-3.6 자동저장 대체.

### EC-5.5 콜드 스타트 스플래시 중 UL 탭 레이스 〔신규〕
- sessionManager.refresh() 완료 전 onOpenURL 수신 시 결과가 타이밍 의존(로그인 상태여도).
- 판정: **미처리** · 심각도: 중 · 수정: pending-deeplink 패턴이 splash도 커버(세션 확정 후 소비).

### EC-5.6 로그인+/l/ 탭 성공 경로
- 파싱→라우팅→뷰어 체인 정상(Deeplink→DeeplinkRouter→RootViewFactory). **처리됨**.

### EC-5.7 앱 내 자기 링크 탭 → 발신자가 수신 화면 봄
- 루프 아님(1회 push). UX 혼란 수준. **설계결함(경, 문서화)**.

### EC-5.8 PWA(홈화면) vs UL 우선순위
- 네이티브 앱 UL이 항상 우선, PWA는 미설치 폴백에서만. **처리됨(플랫폼 정의)**.

### EC-5.9 OAuth 커스텀 스킴 vs UL 간섭
- OauthDeepLinkHandler 우선 체인+경로 불일치로 분리. **처리됨**.

---

## 수정 대상 종합 (Phase B)

| 위치 | 항목 | 케이스 |
|---|---|---|
| **SQL 0022** | accept/get_connect_invite에 INVITE_ALREADY_USED 가드 | EC-2.2 |
| **SQL 0022** | save_to_inbox expires_at 검사 | EC-1.7 |
| **SQL 0022** | get_letter_by_token 인증 비소유자 자동 inbox upsert | EC-3.6 |
| **SQL 0022** | revoke_connect_invite RPC 신설 | EC-2.8 |
| **SQL 0022** | 레거시 초대 expires_at 백필 | EC-2.3 |
| **iOS** | MainView pending-deeplink + 무인증 뷰어(fullScreenCover) | EC-5.1·5.2·5.5·2.4 |
| **iOS** | ViewerModelData/Factory inboxUsecase optional + 자동저장 표시 | EC-5.4·1.2·3.6 |
| **iOS** | SupabaseErrorMapper NOT_CONNECTED·INVITE_ALREADY_USED | EC-3.2·2.2 |
| **iOS** | 닉네임 온보딩 라우팅 | EC-4.6 |
| **iOS** | ConnectInviteView 재시도 버튼 | EC-2.4 |
| **iOS** | Connections 포그라운드 재로드 + 초대 취소 버튼 | EC-2.5·2.8 |
| **iOS** | 계정삭제 확인창 경고 카피 | EC-4.3 |
| **웹** | INVITE_ALREADY_USED 메시지 정규화 | EC-2.2 |
| **웹** | SaveToInboxButton → 자동저장 표시 전환 | EC-3.6 |
| **웹** | 초대 취소 버튼(발급 직후) | EC-2.8 |
| **웹** | 계정삭제 확인창 경고 카피 | EC-4.3 |

## Phase B 적용 기록 (2026-07-02)

전 항목 적용 완료. 검증: 웹 `npm run typecheck` 클린 + vitest 238개 전부 통과 · iOS `mise exec -- tuist build Mutter` Build Succeeded(error 0).

| 항목 | 적용 파일 |
|---|---|
| SQL 5건+백필 | `supabase/migrations/0022_xplat_edge_hardening.sql` (accept/get_connect_invite 가드, save_to_inbox 만료검사, get_letter_by_token 자동저장, revoke_connect_invite 신설, 레거시 백필). 테스트 스크립트 `/tmp/0022_test.sql`(비커밋, 배포 시 실행) |
| 웹 EC-2.2 | `src/data/connections.ts` INVITE_ALREADY_USED 메시지 + `revokeInvite()` |
| 웹 EC-3.6 | `src/features/inbox/SaveToInboxButton.tsx` 버튼→"저장됐어요" 정적 표시 |
| 웹 EC-2.8 | `src/features/connections/InvitePanel.tsx`(+module.css) 초대 취소 버튼 |
| 웹 EC-4.3 | `src/features/profile/MyPageView.tsx` 삭제 확인 경고 |
| iOS EC-5.1/5.2/5.5/2.4 | `Projects/MutterApp/Sources/MainView.swift` — DeeplinkToken + pendingLetter(fullScreenCover 무인증 뷰어, inboxUsecase nil) + pendingConnectToken(스플래시 완료·로그인 완료 2지점 소비) |
| iOS EC-5.4/1.2/3.6 | Viewer 3파일 — `InboxUsecasable?` optional DI, 수동 저장 제거, 로드 성공 시 저장됨 캡션 |
| iOS EC-3.2/2.2 | `MutterErrorDefine/MutterError/SupabaseErrorMapper` — .notConnected·.inviteAlreadyUsed |
| iOS EC-4.6 | `AuthViewWrapperView.swift` — 인증 후 닉네임 없으면 온보딩 경유(웹 needsName 의미론 미러) |
| iOS EC-2.4 | `ConnectInviteView.swift` 실패 상태 "다시 시도" |
| iOS EC-2.5/2.8 | `ConnectionsView/ModelData` scenePhase 재로드 + 초대 취소(Domain·Infra revokeInvite 체인) |
| iOS EC-4.3 | `ProfileView.swift` 삭제 확인 경고 |

### ⚠️ 배포 순서 (필수 — Ralph N-1)

`0022` 마이그레이션은 웹·앱 클라이언트 배포보다 **먼저(또는 동시에)** 적용해야 한다.

1. `supabase db push`(0022 적용) →
2. 웹 배포 + 앱 배포.

이유: 클라이언트는 열람 성공 시 "받은 편지함에 저장됐어요"를 표시하는데, 실제 자동저장은 0022의 `get_letter_by_token` 사이드이펙트가 담당한다. 0022 미적용 상태에서 클라이언트만 배포하면 "저장됨" 표시와 실제 저장이 어긋나는 배포 시차(EC-3.6 관련)가 생긴다. 기능적 오류는 아니며 0022 적용 즉시 해소되지만, 순서를 지키면 시차 자체가 없다.

### Ralph 검증 결과 (Phase C, 2026-07-02)
- 판정: **PASS-WITH-NOTES**, 블로킹 0건. 29케이스 판정 전건 코드 대조 일치, 자동저장 게이트 순서 안전, pending 딥링크 4조합 정확, 웹 238테스트·타입체크 그린, iOS 빌드 그린(빌드 후 Swift 무변경).
- 비블로킹 노트: N-1 배포 순서(위 반영), N-2 EC-4.5 대시보드 확인(사용자 액션), N-3 콜드스타트+로그인+/l/ 시 fullScreenCover 수동 닫기(무마찰 위반 아님, 기능 정상).

수정 커밋: iOS(Mutter) `39bf804` · 웹(letter-app) 본 커밋(이 문서 포함).

## v2 백로그
- EC-4.3 근본 수정: 계정삭제 시 편지 익명화(수신자 보관본 보존).
- EC-1.1 발신자 고지: "보낸 편지를 수정하면 수신자에게도 반영됩니다" 카피.
- EC-2.5 실시간 반영: Supabase Realtime 구독(현재는 재로드로 충분).
