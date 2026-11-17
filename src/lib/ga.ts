// GA4(gtag.js) 연결 — 앱(Firebase Analytics)과 같은 GA4 속성으로 보낸다.
// 계약: Mutter/docs/specs/2026-11-16-analytics.md
//
// - 쿠키는 세션 쿠키만(cookie_expires: 0): 브라우저를 닫으면 사라져 방문을 넘나드는 식별이 없다.
// - 광고 신호(Google 신호·광고 개인화)를 끈다.
// - 편지·초대 링크의 토큰이 Google로 가지 않게 주소에서 지운 뒤 보낸다. 페이지 조회도 직접 보낸다
//   (GA4 웹 스트림의 "브라우저 기록 이벤트 기반 페이지 변경"은 원래 주소를 보내므로 꺼 둔다).
import { setAnalyticsSink } from '@/lib/analytics';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/** 토큰·편지 id가 든 경로 조각을 자리표시로 바꾼다. 쿼리·해시는 버린다(암호 등이 실릴 수 있다). */
const SENSITIVE_PATHS: [RegExp, string][] = [
  [/^\/l\/[^/]+/, '/l/:token'],
  [/^\/connect\/[^/]+/, '/connect/:token'],
  [/^\/create\/[^/]+/, '/create/:id'],
  [/^\/preview\/[^/]+/, '/preview/:id'],
];

export function sanitizePath(pathname: string): string {
  for (const [pattern, replacement] of SENSITIVE_PATHS) {
    if (pattern.test(pathname)) return pathname.replace(pattern, replacement);
  }
  return pathname;
}

function sanitizedLocation(pathname: string): string {
  return `${window.location.origin}${sanitizePath(pathname)}`;
}

/**
 * 측정 ID가 있으면 gtag.js를 붙이고 `track()`이 GA4로 가게 한다. 없으면 아무것도 하지 않는다.
 * 돌려준 함수를 라우트가 바뀔 때마다 부르면 페이지 조회를 남긴다.
 */
export function initGoogleAnalytics(measurementId: string | undefined): ((pathname: string) => void) | null {
  if (!measurementId || typeof window === 'undefined') return null;

  window.dataLayer = window.dataLayer ?? [];
  // gtag.js는 arguments 객체 자체를 dataLayer에 넣어야 인식한다(공식 스니펫과 같은 모양).
  const gtag: Gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag = gtag;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  gtag('config', measurementId, {
    send_page_view: false,
    page_location: sanitizedLocation(window.location.pathname),
    cookie_expires: 0,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  setAnalyticsSink((name, props) => gtag('event', name, props ?? {}));

  return (pathname: string) => {
    const pageLocation = sanitizedLocation(pathname);
    // 이후 이벤트(viewer_gate_open 등)도 지운 주소로 묶이게 전역 값을 바꾼 뒤 조회를 보낸다.
    gtag('set', { page_location: pageLocation });
    gtag('event', 'page_view', { page_location: pageLocation, page_title: document.title });
  };
}
