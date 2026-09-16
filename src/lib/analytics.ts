// 쿠키리스 웹 이벤트 6개 — 이름을 여기서 고정하고 호출 자리만 심는다(1주차 L4 훅).
// 도구(Vercel Analytics / Plausible / Umami)는 2~3주차에 붙인다. 미연결 시 no-op이라 무해하다.
// "추적 없음" 포지셔닝을 웹에서도 지킨다: 식별자·쿠키·본문을 절대 보내지 않는다.

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
