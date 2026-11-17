// 웹 이벤트 6개 — 이름을 여기서 고정하고 호출 자리만 심는다.
// 운영 빌드에 VITE_GA_MEASUREMENT_ID가 있으면 GA4로 보낸다(lib/ga.ts). 없으면 no-op이라 무해하다.
// 광고 추적은 하지 않는다: 세션 쿠키만 쓰고, 사용자 식별자·편지 본문·링크 토큰은 보내지 않는다.

export type AnalyticsEvent =
  | 'viewer_gate_open'
  | 'letter_end_reached'
  | 'cta_reply_click'
  | 'cta_save_click'
  | 'cta_send_click'
  | 'store_redirect';

export type AnalyticsProps = Record<string, string | number | boolean>;

type Sink = (name: AnalyticsEvent, props?: AnalyticsProps) => void;

let sink: Sink | null = null;

/** 도구를 붙일 때 한 번 호출한다(예: Plausible의 `window.plausible`). */
export function setAnalyticsSink(next: Sink | null): void {
  sink = next;
}

export function track(name: AnalyticsEvent, props?: AnalyticsProps): void {
  if (sink) {
    sink(name, props);
    return;
  }
  if (import.meta.env.DEV) {
    console.debug('[analytics]', name, props ?? {});
  }
}
