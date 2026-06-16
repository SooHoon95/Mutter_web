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
  /** iframe을 붙일 컨테이너(기본: document.body). viewer는 nowplaying 바를 넘긴다. */
  container?: HTMLElement;
  /** SC.Widget(iframe) 대체. 미지정 시 동적 로드된 window.SC.Widget 사용. */
  widgetFactory?: (iframe: HTMLIFrameElement) => SCWidget;
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
    (this.options.container ?? document.body).appendChild(iframe);
    this.iframe = iframe;

    // 3) 위젯 핸들 생성.
    const widget = this.makeWidget(iframe);
    this.widget = widget;

    // 4) READY를 기다려 이벤트 바인딩을 끝낸다(이후 seekTo/setVolume 안전).
    await new Promise<void>((resolve) => {
      const events = this.scEvents();
      widget.bind(events.READY, () => {
        this.bindWidgetEvents(widget);
        resolve();
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
  }
}
