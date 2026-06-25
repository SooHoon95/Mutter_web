// SoundCloudSource — SoundCloud Widget API(<iframe> + SC.Widget) 래퍼.
//
// 키 불필요·무로그인 풀재생. **canonical embed URL만** 사용한다.
// 스트림 URL rip/proxy/cache/재호스팅은 면책 상실이므로 절대 금지(license-compliance).
//
// [learning-comments] 처음 도입하는 외부 SDK라 흐름을 따라갈 수 있게 주석을 풍부히 단다.
//  1) https://w.soundcloud.com/player/api.js 를 동적 로드하면 window.SC 가 생긴다.
//  2) w.soundcloud.com/player/?url=<canonical track URL> 을 src로 가진 <iframe>을 만든다.
//  3) SC.Widget(iframe) 으로 위젯 핸들을 얻고 READY 이후 play/seekTo/setVolume 을 쓴다.
//  4) iOS는 첫 사용자 제스처 안에서 play()를 한 번 호출해야 이후 자동 제어가 허용된다(PoC).

import type { ProgressCb, FinishCb, TrackSource, Unsub } from './TrackSource';
import type { SCProgressEvent, SCWidget } from './soundcloud';

const SC_API_SRC = 'https://w.soundcloud.com/player/api.js';

/**
 * 0..1 정규화 볼륨을 SC Widget 스케일(0..100)로 변환하는 순수 헬퍼.
 * 0→0, 1→100, 0.5→50. 범위를 넘는 입력은 클램프한다.
 */
export function toScVolume(v: number): number {
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(clamped * 100);
}

/**
 * canonical SoundCloud 트랙 URL을 Widget embed iframe src로 만든다.
 * auto_play=false: 재생 시점은 unlock()/play()가 제스처 컨텍스트에서 통제한다.
 * visual=false: 순수 오디오 모드(거대 아트워크 없이 컴팩트 플레이어).
 */
export function buildEmbedSrc(trackUrl: string): string {
  const params = new URLSearchParams({
    url: trackUrl,
    auto_play: 'false',
    visual: 'false',
    hide_related: 'true',
    show_comments: 'false',
    show_reposts: 'false',
    show_teaser: 'false',
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}

// 동적 스크립트 로드는 한 번만 — 동시 호출이 와도 같은 Promise를 공유한다.
let apiLoadPromise: Promise<void> | null = null;

// viewer가 등록하는 iframe 부착 호스트(전역 기본값).
// iOS PWA 풀스크린에서 iframe이 document.body 직속에 붙으면 Widget postMessage 채널이
// 끊겨 무음이 되는 사례가 있어, viewer가 "본문 안에 있지만 시각적으로 숨긴" 호스트를
// 등록하고 모든 SC iframe이 그 안에 mount되도록 한다(SoundCloudSourceOptions.container 미지정 시).
let defaultContainer: HTMLElement | null = null;

/**
 * viewer가 SC iframe을 붙일 기본 컨테이너를 등록한다.
 * unmount 시 null로 해제해 떠도는 참조를 남기지 않는다.
 * options.container를 명시하면 그 값이 우선한다(테스트·특수 케이스).
 */
export function setSoundCloudContainer(el: HTMLElement | null): void {
  defaultContainer = el;
}

// READY 이벤트가 끝내 오지 않을 때(SC 장애·차단) load()가 영원히 매달리는 것을 막는 상한.
// 이 시간 안에 READY가 없으면 load()를 reject → FallbackTrackSource가 CC0로 전환한다(무음0).
const READY_TIMEOUT_MS = 8000;

function loadWidgetApi(): Promise<void> {
  if (typeof window !== 'undefined' && window.SC) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SC_API_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      apiLoadPromise = null; // 실패 시 재시도 가능하게 초기화
      reject(new Error('[SoundCloudSource] Widget API 스크립트 로드 실패'));
    };
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

/** 테스트·환경 주입용 옵션. iframe 부착 컨테이너와 위젯 팩토리를 교체할 수 있다. */
export interface SoundCloudSourceOptions {
  /**
   * iframe을 붙일 컨테이너. 미지정 시 viewer가 등록한 기본 컨테이너
   * (setSoundCloudContainer)를 쓰고, 그조차 없으면 최후에 document.body로 폴백한다.
   */
  container?: HTMLElement;
  /** SC.Widget(iframe) 대체. 미지정 시 동적 로드된 window.SC.Widget 사용. */
  widgetFactory?: (iframe: HTMLIFrameElement) => SCWidget;
  /** READY 대기 상한(ms). 테스트에서 짧게 주입. 기본 READY_TIMEOUT_MS. */
  readyTimeoutMs?: number;
}

export class SoundCloudSource implements TrackSource {
  private readonly trackUrl: string;
  private readonly options: SoundCloudSourceOptions;

  private iframe: HTMLIFrameElement | null = null;
  private widget: SCWidget | null = null;

  // SC 이벤트는 unbind 시 이벤트명만 받으므로(개별 핸들러 해제 불가),
  // 우리가 콜백 목록을 직접 관리하고 destroy에서 위젯 이벤트를 통째로 unbind한다.
  private readonly progressCbs = new Set<ProgressCb>();
  private readonly finishCbs = new Set<FinishCb>();

  constructor(trackUrl: string, options: SoundCloudSourceOptions = {}) {
    this.trackUrl = trackUrl;
    this.options = options;
  }

  async load(): Promise<void> {
    if (this.widget) return; // 멱등

    // 1) Widget API 확보(주입 팩토리가 없을 때만 스크립트 로드).
    if (!this.options.widgetFactory) await loadWidgetApi();

    // 2) canonical embed URL iframe 생성·부착.
    const iframe = document.createElement('iframe');
    iframe.src = buildEmbedSrc(this.trackUrl);
    // SoundCloud 공식 embed와 동일하게 autoplay + encrypted-media를 모두 위임해야 한다.
    // encrypted-media가 없으면 "Permissions policy violation"으로 위젯 재생이 막히고,
    // 특히 사용자 제스처 밖(스크롤 전환)에서 트는 2번째 이후 트랙이 재생되지 않는다.
    iframe.allow = 'autoplay; encrypted-media';
    iframe.style.width = '100%';
    iframe.style.border = '0';
    // 컨테이너 우선순위: 명시 옵션 > viewer 등록 기본값 > document.body 최후 폴백.
    const host = this.options.container ?? defaultContainer ?? document.body;
    host.appendChild(iframe);
    this.iframe = iframe;

    // 3) 위젯 핸들 생성.
    const widget = this.makeWidget(iframe);
    this.widget = widget;

    // 4) READY를 기다려 이벤트 바인딩을 끝낸다(이후 seekTo/setVolume 안전).
    //    - ERROR(삭제·geo·embed-disabled)면 즉시 reject → FallbackTrackSource가 CC0로 전환.
    //    - READY가 끝내 안 오면(SC 장애·차단) 타임아웃으로 reject → 무음0 폴백 발동.
    const timeoutMs = this.options.readyTimeoutMs ?? READY_TIMEOUT_MS;
    await new Promise<void>((resolve, reject) => {
      const events = this.scEvents();
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('[SoundCloudSource] READY 타임아웃 — SC 장애/차단 의심'));
      }, timeoutMs);

      widget.bind(events.READY, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.bindWidgetEvents(widget);
        resolve();
      });

      // ERROR가 READY 전에 오면 로드 실패로 간주(폴백 트리거). READY 후 ERROR는
      // bindWidgetEvents에서 재바인딩되어 재생 중 실패도 감지한다.
      widget.bind(events.ERROR, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('[SoundCloudSource] Widget ERROR — 트랙 재생 불가(삭제/geo/embed-disabled)'));
      });
    });
  }

  async unlock(): Promise<void> {
    // iOS 언락: 제스처 컨텍스트 안에서 play() 1회.
    // SC Widget은 동기 호출이므로 즉시 resolve(인터페이스 동형성 위해 Promise).
    this.widget?.play();
    return Promise.resolve();
  }

  play(): void {
    this.widget?.play();
  }

  pause(): void {
    this.widget?.pause();
  }

  seekTo(ms: number): void {
    // SC seekTo는 ms 단위 — 인터페이스 단위와 동일(변환 불필요).
    this.widget?.seekTo(ms);
  }

  setVolume(v: number): void {
    // 0..1 → 0..100 변환은 순수 헬퍼로.
    this.widget?.setVolume(toScVolume(v));
  }

  onProgress(cb: ProgressCb): Unsub {
    this.progressCbs.add(cb);
    return () => {
      this.progressCbs.delete(cb);
    };
  }

  onFinish(cb: FinishCb): Unsub {
    this.finishCbs.add(cb);
    return () => {
      this.finishCbs.delete(cb);
    };
  }

  destroy(): void {
    if (this.widget) {
      // PLAY_PROGRESS·FINISH 이벤트를 통째로 해제(개별 핸들러 해제 API 없음).
      const events = this.scEvents();
      this.widget.unbind(events.PLAY_PROGRESS);
      this.widget.unbind(events.FINISH);
      this.widget.unbind(events.READY);
      this.widget.unbind(events.ERROR);
    }
    this.progressCbs.clear();
    this.finishCbs.clear();
    // iframe 제거 → SC 플레이어 리소스 해제.
    this.iframe?.remove();
    this.iframe = null;
    this.widget = null;
  }

  // --- 내부 헬퍼 -----------------------------------------------------------

  private makeWidget(iframe: HTMLIFrameElement): SCWidget {
    if (this.options.widgetFactory) return this.options.widgetFactory(iframe);
    const SC = window.SC;
    if (!SC) throw new Error('[SoundCloudSource] window.SC 미로드 — load() 순서 확인');
    return SC.Widget(iframe);
  }

  private scEvents() {
    // 주입 팩토리 사용 시 window.SC가 없을 수 있으므로 이벤트 상수도 방어적으로 얻는다.
    return (
      window.SC?.Widget.Events ?? {
        READY: 'ready',
        PLAY: 'play',
        PAUSE: 'pause',
        FINISH: 'finish',
        PLAY_PROGRESS: 'playProgress',
        ERROR: 'error',
      }
    );
  }

  private bindWidgetEvents(widget: SCWidget): void {
    const events = this.scEvents();
    // PLAY_PROGRESS의 currentPosition(ms)을 모든 progress 구독자에게 fan-out.
    widget.bind(events.PLAY_PROGRESS, (e?: SCProgressEvent) => {
      const ms = e?.currentPosition ?? 0;
      for (const cb of this.progressCbs) cb(ms);
    });
    widget.bind(events.FINISH, () => {
      for (const cb of this.finishCbs) cb();
    });
    // READY 이후의 ERROR(재생 중 트랙 삭제·geo 차단 등). load는 이미 성공했으므로
    // CC0 재폴백은 불가하지만, finish로 surface해 "재생 중" UI가 무음을 가리지 않게 한다.
    widget.bind(events.ERROR, () => {
      for (const cb of this.finishCbs) cb();
    });
  }
}
