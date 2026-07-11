// 앱 딥링크(커스텀 스킴) 빌더 + 핸드오프 활성화 플래그 — 링크 앱 핸드오프(plan §A2).
//
// 네이티브 앱(Mutter)은 커스텀 스킴 mutter://connect/<t> · mutter://l/<t> 를 파싱한다.
// 웹은 인앱브라우저(카톡 등)에서 이 스킴을 발화해 앱으로 넘긴다(Universal Link가 안 통하는 맥락).
//
// dark-ship: 앱 미출시 기간에는 HANDOFF_ENABLED=false로 두어 오늘 동작(웹 전용)과 100% 동일하게
// 축퇴시킨다(plan D2·AC7). 스토어 URL이 설정되거나 VITE_ENABLE_HANDOFF=true면 켜진다.

/** 네이티브 앱 커스텀 스킴. */
export const APP_SCHEME = 'mutter';

/** 연결 초대 딥링크 — mutter://connect/<token>. */
export function appConnectUrl(token: string): string {
  return `${APP_SCHEME}://connect/${token}`;
}

/** 편지 딥링크 — mutter://l/<token>. */
export function appLetterUrl(token: string): string {
  return `${APP_SCHEME}://l/${token}`;
}

/**
 * 커스텀 스킴을 발화해 앱으로 넘긴다(숨김 iframe 기법).
 * WKWebView(카톡 등)에서 window.location 대신 iframe src를 쓰면 "페이지를 열 수 없음" 팝업 없이
 * 앱이 열린다. 발화 후 잠깐 뒤 iframe을 정리한다. 미설치면 아무 일도 일어나지 않는다(무해).
 */
export function openAppScheme(url: string): void {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 1000);
}

/**
 * iOS 앱 스토어(또는 TestFlight) URL. 미설정이면 null — 설치 CTA를 숨긴다(무해).
 * 기존 env(VITE_IOS_APP_STORE_URL)를 재사용한다. .env.example처럼 빈 문자열(`=`)로 두면
 * "미설정"과 동일하게 null로 정규화한다 — 빈 URL이 핸드오프를 잘못 켜지 않도록.
 */
const rawStoreUrl = import.meta.env.VITE_IOS_APP_STORE_URL as string | undefined;
export const APP_STORE_URL: string | null =
  rawStoreUrl !== undefined && rawStoreUrl.trim() !== '' ? rawStoreUrl : null;

/**
 * 핸드오프 기능 활성화 여부.
 * 스토어 URL이 있으면(출시됨) 자동 ON, 없어도 VITE_ENABLE_HANDOFF=true면 강제 ON(프리뷰 검증용).
 * 둘 다 아니면 OFF → /connect 인터스티셜을 건너뛰고 오늘의 웹 보호 플로우로 축퇴한다.
 */
export const HANDOFF_ENABLED: boolean =
  APP_STORE_URL !== null || import.meta.env.VITE_ENABLE_HANDOFF === 'true';

/**
 * 초대 링크 출처 판별 — `?from=app`(앱 발급) vs 그 외(웹 발급, 기본).
 * 앱 미설치 폴백을 App Store(app) vs 웹(web)으로 가르는 유일한 기준(초대링크 규칙).
 * app이 명시됐을 때만 true — 누락/오타/web은 전부 웹 폴백(안전 기본값).
 */
export function inviteFromApp(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return new URLSearchParams(search).get('from') === 'app';
}
